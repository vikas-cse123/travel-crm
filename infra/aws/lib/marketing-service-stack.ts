import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { type Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { type DeployConfig } from '../config.js';

export interface MarketingServiceStackProps extends StackProps {
  config: DeployConfig;
}

/**
 * Public marketing website service: a dedicated Nginx Fargate service behind
 * the existing production ALB. The VPC, cluster, ALB listener and ALB security
 * group are imported by ARN/id — this stack only creates marketing resources
 * and additive listener rules/certificates for travelagencycrm.in.
 *
 * Listener priorities in use on the shared HTTPS listener:
 *   10  origin-protection (X-Origin-Verify -> API)      [preserved]
 *   20  app host + /api -> API                          [preserved]
 *   30  app host -> CRM frontend                        [preserved]
 *   40  www host -> 301 redirect to root domain         [this stack]
 *   45  root host + marketing pages -> marketing        [this stack]
 *   46  root host + marketing assets -> marketing       [this stack]
 *   47  root host + marketing SEO files -> marketing    [this stack]
 *   48  root host + marketing 404/html -> marketing     [this stack]
 *   49  root host + /api -> API (friendly-slug page)    [this stack]
 *   50  root host -> CRM frontend (friendly slug pages) [this stack]
 */
export class MarketingServiceStack extends Stack {
  readonly marketingTargetGroupArn: string;
  readonly marketingServiceName: string;

  constructor(scope: Construct, id: string, props: MarketingServiceStackProps) {
    super(scope, id, props);
    const { config } = props;

    if (!config.vpcId || !config.clusterArn || !config.listenerArn) {
      throw new Error(
        'MarketingServiceStack requires existing backend resource references in config.',
      );
    }

    // --------------------------------------------------- Imported resources
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'Vpc', {
      vpcId: config.vpcId,
      availabilityZones:
        config.publicSubnetIds.length === 2 ? ['ap-south-1a', 'ap-south-1b'] : ['ap-south-1a'],
      publicSubnetIds: config.publicSubnetIds,
    });

    const albSg = ec2.SecurityGroup.fromSecurityGroupId(this, 'AlbSg', config.albSecurityGroupId);

    const cluster = ecs.Cluster.fromClusterAttributes(this, 'Cluster', {
      clusterName: config.clusterName,
      clusterArn: config.clusterArn,
      vpc,
      securityGroups: [albSg],
    });

    const listener = elbv2.ApplicationListener.fromApplicationListenerAttributes(this, 'Listener', {
      listenerArn: config.listenerArn,
      securityGroup: albSg,
      defaultPort: 443,
    });

    const marketingRepo = ecr.Repository.fromRepositoryArn(
      this,
      'MarketingRepo',
      config.marketingRepoArn,
    );

    const marketingCertificate = acm.Certificate.fromCertificateArn(
      this,
      'MarketingCertificate',
      config.marketingCertArn,
    );

    // The friendly `travelagencycrm.in/<publicSlug>` page is rendered by the CRM
    // frontend (the SPA already hosts PublicQuotationPage), and its API calls
    // are served same-origin, so the marketing host needs the API and frontend
    // target groups imported here. Both are pre-existing resources referenced by
    // ARN, mirroring how AlbFrontendStack imports the API target group.
    const apiTargetGroup = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(
      this,
      'ApiTargetGroup',
      { targetGroupArn: config.apiTargetGroupArn },
    );
    const frontendTargetGroup = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(
      this,
      'FrontendTargetGroup',
      { targetGroupArn: config.frontendTargetGroupArn },
    );

    // ------------------------------------------------ Marketing security
    // Least-privilege: only the ALB may reach port 8080. No direct inbound.
    const marketingSg = new ec2.SecurityGroup(this, 'MarketingSg', {
      vpc,
      allowAllOutbound: true,
    });
    marketingSg.addIngressRule(albSg, ec2.Port.tcp(8080), 'Marketing port from ALB');

    // ------------------------------------------------------------ Log group
    const marketingLogGroup = new logs.LogGroup(this, 'MarketingLogGroup', {
      logGroupName: '/ecs/interscale-travel-crm-prod-marketing',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ------------------------------------------------ Minimal execution role
    // Static site: image pull + logging only. No secrets, no data permissions.
    const marketingExecRole = new iam.Role(this, 'MarketingExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    marketingExecRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ecr:GetAuthorizationToken', 'ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer'],
        resources: ['*'],
      }),
    );
    marketingExecRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );

    // ------------------------------------------------- Minimal task role
    // Empty role required for awsvpc tasks; grants nothing by default.
    const marketingTaskRole = new iam.Role(this, 'MarketingTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // -------------------------------------------------------- Task definition
    const taskDef = new ecs.FargateTaskDefinition(this, 'MarketingTaskDef', {
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole: marketingExecRole,
      taskRole: marketingTaskRole,
      family: 'interscale-travel-crm-prod-marketing',
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
    taskDef.addContainer('marketing', {
      image: ecs.ContainerImage.fromEcrRepository(marketingRepo, config.imageTag),
      containerName: 'marketing',
      portMappings: [{ containerPort: 8080, protocol: ecs.Protocol.TCP }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'marketing',
        logGroup: marketingLogGroup,
      }),
      healthCheck: {
        command: ['CMD-SHELL', 'wget -q -O - http://127.0.0.1:8080/healthz | grep -q "^ok"'],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(20),
      },
    });

    // -------------------------------------------------------- Target group
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'MarketingTargetGroup', {
      vpc,
      port: 8080,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/healthz',
        healthyHttpCodes: '200',
        interval: Duration.seconds(25),
        timeout: Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: Duration.seconds(30),
    });

    // --------------------------------------------------------------- Service
    // Consistent with the existing frontend service: public subnets with a
    // public IP (the VPC has no NAT gateways, so ECS tasks need public subnets
    // to reach ECR). Inbound is restricted to the ALB security group only.
    const service = new ecs.FargateService(this, 'MarketingService', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: config.desiredCount,
      assignPublicIp: true,
      vpcSubnets: { subnets: vpc.publicSubnets },
      securityGroups: [marketingSg],
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      healthCheckGracePeriod: Duration.seconds(60),
      circuitBreaker: { rollback: true },
      serviceName: 'interscale-travel-crm-prod-marketing',
    });
    service.attachToApplicationTargetGroup(targetGroup);

    // ------------------------------------------- Listener certificate (SNI)
    // Attach the travelagencycrm.in + www.travelagencycrm.in certificate
    // alongside the existing app.travelagencycrm.in / origin.app certificates.
    listener.addCertificates('MarketingCertificateAttachment', [marketingCertificate]);

    // ------------------------------------------------ Listener rules
    // Priority 40: www -> permanent 301 redirect to the root domain, preserving
    // path and query.
    //
    // Priority 45-50 route the root domain:
    //   - 45/46/47: the real marketing website paths and static assets stay on
    //     the marketing container (split across three rules because ALB allows
    //     at most 5 condition values per rule).
    //   - 48: same-origin /api for the friendly quotation page.
    //   - 50: everything else (extensionless friendly slugs) -> CRM frontend,
    //     where PublicQuotationPage resolves `/:slug`.
    // Host-based conditions make these mutually exclusive with the app rules.
    listener.addAction('MarketingWwwRedirectRule', {
      priority: 40,
      conditions: [elbv2.ListenerCondition.hostHeaders([config.marketingWwwDomain])],
      action: elbv2.ListenerAction.redirect({
        host: config.marketingDomain,
        path: '/#{path}',
        query: '#{query}',
        protocol: 'HTTPS',
        permanent: true,
      }),
    });
    const marketingHost = () => elbv2.ListenerCondition.hostHeaders([config.marketingDomain]);
    const marketingForward = () => elbv2.ListenerAction.forward([targetGroup]);
    listener.addAction('MarketingReservedPagesRule', {
      priority: 45,
      conditions: [
        marketingHost(),
        elbv2.ListenerCondition.pathPatterns(['/', '/privacy', '/terms', '/healthz']),
      ],
      action: marketingForward(),
    });
    listener.addAction('MarketingReservedAssetsRule', {
      priority: 46,
      conditions: [
        marketingHost(),
        elbv2.ListenerCondition.pathPatterns(['/assets', '/assets/*', '/favicon.svg', '/logo.svg']),
      ],
      action: marketingForward(),
    });
    listener.addAction('MarketingReservedSeoRule', {
      priority: 47,
      conditions: [
        marketingHost(),
        elbv2.ListenerCondition.pathPatterns([
          '/og-image.png',
          '/og-image.svg',
          '/robots.txt',
          '/sitemap.xml',
        ]),
      ],
      action: marketingForward(),
    });
    // Canonical 404 route (`/404` -> 404.html via try_files) plus the raw HTML
    // entry points that the marketing nginx serves directly for crawlers.
    listener.addAction('MarketingReservedHtmlRule', {
      priority: 48,
      conditions: [
        marketingHost(),
        elbv2.ListenerCondition.pathPatterns([
          '/404',
          '/index.html',
          '/privacy.html',
          '/terms.html',
        ]),
      ],
      action: marketingForward(),
    });
    listener.addAction('MarketingApiRule', {
      priority: 49,
      conditions: [marketingHost(), elbv2.ListenerCondition.pathPatterns(['/api', '/api/*'])],
      action: elbv2.ListenerAction.forward([apiTargetGroup]),
    });
    listener.addAction('MarketingRootRule', {
      priority: 50,
      conditions: [marketingHost()],
      action: elbv2.ListenerAction.forward([frontendTargetGroup]),
    });

    this.marketingTargetGroupArn = targetGroup.targetGroupArn;
    this.marketingServiceName = service.serviceName;

    new CfnOutput(this, 'MarketingTargetGroupArn', { value: targetGroup.targetGroupArn });
    new CfnOutput(this, 'MarketingServiceName', { value: service.serviceName });
    new CfnOutput(this, 'MarketingSecurityGroupId', { value: marketingSg.securityGroupId });
    new CfnOutput(this, 'MarketingLogGroupName', { value: marketingLogGroup.logGroupName });
  }
}
