import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { DeployConfig } from '../config.js';

export interface AlbFrontendStackProps extends StackProps {
  config: DeployConfig;
}

/**
 * No-CloudFront production frontend: a dedicated Nginx Fargate service behind
 * the existing ALB. The backend resources (VPC, cluster, ALB, listener, API
 * target group, ALB security group) are imported by ARN/id from the existing
 * `InterscaleApiStack` deployment — this stack only creates frontend resources
 * and additive listener rules/certificates.
 */
export class AlbFrontendStack extends Stack {
  readonly frontendTargetGroupArn: string;
  readonly frontendServiceName: string;
  readonly frontendSecurityGroupId: string;

  constructor(scope: Construct, id: string, props: AlbFrontendStackProps) {
    super(scope, id, props);
    const { config } = props;

    if (!config.vpcId || !config.clusterArn || !config.listenerArn) {
      throw new Error('AlbFrontendStack requires existing backend resource references in config.');
    }

    // --------------------------------------------------- Imported resources
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'Vpc', {
      vpcId: config.vpcId,
      availabilityZones: config.publicSubnetIds.length === 2 ? ['ap-south-1a', 'ap-south-1b'] : ['ap-south-1a'],
      publicSubnetIds: config.publicSubnetIds,
    });

    const albSg = ec2.SecurityGroup.fromSecurityGroupId(this, 'AlbSg', config.albSecurityGroupId);

    const cluster = ecs.Cluster.fromClusterAttributes(this, 'Cluster', {
      clusterName: config.clusterName,
      clusterArn: config.clusterArn,
      vpc,
      securityGroups: [albSg],
    });

    const listener = elbv2.ApplicationListener.fromApplicationListenerAttributes(
      this,
      'Listener',
      {
        listenerArn: config.listenerArn,
        securityGroup: albSg,
        defaultPort: 443,
      },
    );

    const apiTargetGroup = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(
      this,
      'ApiTargetGroup',
      { targetGroupArn: config.apiTargetGroupArn },
    );

    const frontendRepo = ecr.Repository.fromRepositoryArn(
      this,
      'FrontendRepo',
      config.frontendRepoArn,
    );

    const appCertificate = acm.Certificate.fromCertificateArn(
      this,
      'AppCertificate',
      config.appCertArn,
    );

    // ----------------------------------------------------- Frontend security
    const frontendSg = new ec2.SecurityGroup(this, 'FrontendSg', {
      vpc,
      allowAllOutbound: true,
    });
    frontendSg.addIngressRule(albSg, ec2.Port.tcp(8080), 'Frontend port from ALB');

    // ---------------------------------------------------------- Log group
    const frontendLogGroup = new logs.LogGroup(this, 'FrontendLogGroup', {
      logGroupName: '/ecs/interscale-travel-crm-prod/frontend',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ------------------------------------------------ Minimal execution role
    // Frontend needs only image pull + logging. It must NOT inherit the API
    // execution role (which can read secrets), and needs no task role at all.
    const frontendExecRole = new iam.Role(this, 'FrontendExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    frontendExecRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ecr:GetAuthorizationToken', 'ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer'],
        resources: ['*'],
      }),
    );
    frontendExecRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );

    // -------------------------------------------------------- Task definition
    const taskDef = new ecs.FargateTaskDefinition(this, 'FrontendTaskDef', {
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole: frontendExecRole,
      family: 'interscale-travel-crm-prod-frontend',
    });
    taskDef.addContainer('frontend', {
      image: ecs.ContainerImage.fromEcrRepository(frontendRepo, config.imageTag),
      containerName: 'frontend',
      portMappings: [{ containerPort: 8080, protocol: ecs.Protocol.TCP }],
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'frontend',
        logGroup: frontendLogGroup,
      }),
      healthCheck: {
        command: ['CMD-SHELL', 'wget -q -O - http://127.0.0.1:8080/healthz | grep -q "^ok"'],
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        retries: 3,
        startPeriod: Duration.seconds(20),
      },
    });

    // ------------------------------------------------------ Target group
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'FrontendTargetGroup', {
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

    // ------------------------------------------------------------- Service
    const service = new ecs.FargateService(this, 'FrontendService', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: config.desiredCount,
      assignPublicIp: true,
      vpcSubnets: { subnets: vpc.publicSubnets },
      securityGroups: [frontendSg],
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      healthCheckGracePeriod: Duration.seconds(60),
      circuitBreaker: { rollback: true },
      serviceName: 'interscale-travel-crm-prod-frontend',
    });
    service.attachToApplicationTargetGroup(targetGroup);

    // --------------------------------------------- Listener certificates
    // Attach the app-domain certificate via SNI alongside the existing
    // origin.app certificate (which is untouched).
    listener.addCertificates('AppCertificateAttachment', [appCertificate]);

    // --------------------------------------------- Listener rules
    // Priority 20: PUBLIC API — app host + /api + /api/* → API target group.
    // Priority 30: PUBLIC FRONTEND — app host, everything else → frontend.
    // The existing priority-10 origin-header rule and the default 403 are
    // preserved unchanged.
    listener.addAction('PublicApiRule', {
      priority: 20,
      conditions: [
        elbv2.ListenerCondition.hostHeaders([config.appDomain]),
        elbv2.ListenerCondition.pathPatterns(['/api', '/api/*']),
      ],
      action: elbv2.ListenerAction.forward([apiTargetGroup]),
    });
    listener.addAction('PublicFrontendRule', {
      priority: 30,
      conditions: [elbv2.ListenerCondition.hostHeaders([config.appDomain])],
      action: elbv2.ListenerAction.forward([targetGroup]),
    });

    // Priority 60/70: catch-all routing for dynamic custom-domain hosts. Custom
    // hostnames are created at runtime (Phase 3), so they cannot be enumerated
    // in a static rule; these lower-precedence path rules send their /api and
    // frontend traffic to the same targets as the app domain (ELBv2 host-header
    // conditions cannot match "any host"). The higher-precedence app rules
    // (20/30), marketing rules (40/50) and origin rule (10) still win for their
    // own hosts, and Phase 1/2 tenant isolation stays authoritative at the API.
    listener.addAction('CustomHostApiRule', {
      priority: 60,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/api', '/api/*'])],
      action: elbv2.ListenerAction.forward([apiTargetGroup]),
    });
    listener.addAction('CustomHostFrontendRule', {
      priority: 70,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/*'])],
      action: elbv2.ListenerAction.forward([targetGroup]),
    });

    this.frontendTargetGroupArn = targetGroup.targetGroupArn;
    this.frontendServiceName = service.serviceName;
    this.frontendSecurityGroupId = frontendSg.securityGroupId;

    new CfnOutput(this, 'FrontendTargetGroupArn', { value: targetGroup.targetGroupArn });
    new CfnOutput(this, 'FrontendServiceName', { value: service.serviceName });
    new CfnOutput(this, 'FrontendSecurityGroupId', { value: frontendSg.securityGroupId });
    new CfnOutput(this, 'FrontendLogGroupName', { value: frontendLogGroup.logGroupName });
  }
}
