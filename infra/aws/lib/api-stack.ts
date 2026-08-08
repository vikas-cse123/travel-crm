import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { DeployConfig } from '../config.js';

export interface ApiStackProps extends StackProps {
  config: DeployConfig;
}

/** Secret-holding prefix for all API secrets. */
export const SECRET_PREFIX = 'interscale-travel-crm-prod';

export class ApiStack extends Stack {
  /** Internet-facing ALB DNS name, consumed by the frontend stack. */
  readonly albDnsName: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const { config } = props;

    // Single references to the pre-created app secrets, shared by the IAM
    // grant and the container-level secrets injection.
    const appSecrets: Record<string, secretsmanager.ISecret> = {};
    for (const name of APP_SECRET_NAMES) {
      appSecrets[name] = secretByName(config, this, name);
    }

    // ------------------------------------------------------------------ VPC
    const vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // ------------------------------------------------------------------ ECR
    const repo = new ecr.Repository(this, 'ApiRepo', {
      repositoryName: config.repoName,
      imageScanOnPush: true,
      encryption: ecr.RepositoryEncryption.AES_256,
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      lifecycleRules: [{ maxImageCount: 10, tagStatus: ecr.TagStatus.ANY }],
    });

    // ----------------------------------------------------------- S3 files
    const filesBucket = new s3.Bucket(this, 'FilesBucket', {
      bucketName: `interscale-travel-crm-prod-files-ap-south-1-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ['https://app.travelagencycrm.in'],
          allowedHeaders: ['Content-Type'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
    });
    filesBucket.addLifecycleRule({
      id: 'abort-incomplete-multipart',
      enabled: true,
      abortIncompleteMultipartUploadAfter: Duration.days(7),
    });

    // ---------------------------------------------------------------- RDS
    const db = new rds.DatabaseInstance(this, 'Postgres', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16_9 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      databaseName: 'interscale_travel_crm',
      credentials: rds.Credentials.fromGeneratedSecret('postgres'),
      allocatedStorage: 20,
      maxAllocatedStorage: 60,
      storageEncrypted: true,
      backupRetention: Duration.days(1),
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
      publiclyAccessible: false,
      multiAz: false,
      port: 5432,
    });

    // ----------------------------------------------------- Security groups
    // CloudFront origin-facing managed prefix list, resolved by name (never
    // hard-coding the prefix-list id).
    const cloudFrontPrefixList = ec2.PrefixList.fromLookup(this, 'CloudFrontOriginPrefixList', {
      prefixListName: 'com.amazonaws.global.cloudfront.origin-facing',
    });

    const albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc,
      allowAllOutbound: true,
    });
    albSg.addIngressRule(
      ec2.Peer.prefixList(cloudFrontPrefixList.prefixListId),
      ec2.Port.tcp(443),
      'HTTPS from CloudFront origin-facing prefix list',
    );

    const taskSg = new ec2.SecurityGroup(this, 'TaskSg', {
      vpc,
      allowAllOutbound: true,
    });
    taskSg.addIngressRule(albSg, ec2.Port.tcp(4000), 'API port from ALB');

    db.connections.allowFrom(taskSg, ec2.Port.tcp(5432), 'PostgreSQL from ECS tasks');

    // ---------------------------------------------------------------- ALB
    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      idleTimeout: Duration.seconds(120),
    });
    this.albDnsName = alb.loadBalancerDnsName;

    const listener = alb.addListener('HttpsListener', {
      port: 443,
      certificates: [elbv2.ListenerCertificate.fromArn(config.originCertArn)],
      defaultAction: elbv2.ListenerAction.fixedResponse(403, {
        contentType: 'text/plain',
        messageBody: 'Forbidden',
      }),
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'ApiTargetGroup', {
      vpc,
      port: 4000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/api/health/db',
        healthyHttpCodes: '200',
        interval: Duration.seconds(30),
        timeout: Duration.seconds(5),
        unhealthyThresholdCount: 3,
        healthyThresholdCount: 2,
      },
    });

    // Only requests carrying the CloudFront-generated verification header are
    // forwarded; everything else gets a fixed 403.
    listener.addAction('ForwardFromCloudFront', {
      priority: 10,
      conditions: [elbv2.ListenerCondition.httpHeader('X-Origin-Verify', [config.originVerify])],
      action: elbv2.ListenerAction.forward([targetGroup]),
    });

    // ----------------------------------------------------------- IAM roles
    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ecr:GetAuthorizationToken', 'ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer'],
        resources: ['*'],
      }),
    );
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      }),
    );
    db.secret?.grantRead(executionRole);
    for (const name of APP_SECRET_NAMES) {
      appSecrets[name].grantRead(executionRole);
    }

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    filesBucket.grantReadWrite(taskRole);

    // Phase 3 Custom Domain: request/describe ACM certificates and attach/remove
    // certificates on the single shared HTTPS listener. ACM certificate actions
    // cannot be resource-scoped, so they are granted on all certificates; the
    // listener operations are scoped to this deployment's HTTPS listener. No
    // Route53/DNS permissions are granted (customer DNS is managed by them).
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['acm:RequestCertificate', 'acm:DescribeCertificate'],
        resources: ['*'],
      }),
    );
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'elasticloadbalancing:AddListenerCertificates',
          'elasticloadbalancing:RemoveListenerCertificates',
          'elasticloadbalancing:DescribeListenerCertificates',
        ],
        resources: [config.listenerArn],
      }),
    );

    // ----------------------------------------------------- CloudWatch logs
    const apiLogGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: '/ecs/interscale-travel-crm-prod/api',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const migrationLogGroup = new logs.LogGroup(this, 'MigrationLogGroup', {
      logGroupName: '/ecs/interscale-travel-crm-prod/migrations',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // -------------------------------------------------------------- ECS
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: 'interscale-travel-crm-prod',
    });

    const taskDef = new ecs.FargateTaskDefinition(this, 'ApiTaskDef', {
      cpu: 512,
      memoryLimitMiB: 1024,
      executionRole,
      taskRole,
      family: 'interscale-travel-crm-prod-api',
    });

    taskDef.addContainer('api', {
      image: ecs.ContainerImage.fromEcrRepository(repo, config.imageTag),
      containerName: 'api',
      portMappings: [{ containerPort: 4000, protocol: ecs.Protocol.TCP }],
      environment: {
        NODE_ENV: 'production',
        API_PORT: '4000',
        API_URL: 'https://app.travelagencycrm.in',
        WEB_URL: 'https://app.travelagencycrm.in',
        LOG_LEVEL: 'info',
        EMAIL_PROVIDER: 'smtp',
        STORAGE_PROVIDER: 's3',
        AWS_REGION: 'ap-south-1',
        AWS_S3_BUCKET: filesBucket.bucketName,
        AWS_S3_SERVER_SIDE_ENCRYPTION: 'AES256',
        DATA_ENCRYPTION_KEY_VERSION: 'v1',
        // Phase 3 Custom Domain: stable CNAME target customers point their
        // subdomain at, and the HTTPS listener certificates attach to.
        CUSTOM_DOMAIN_CNAME_TARGET: config.appDomain,
        CUSTOM_DOMAIN_HTTPS_LISTENER_ARN: config.listenerArn,
      },
      secrets: {
        DB_HOST: ecs.Secret.fromSecretsManager(db.secret!, 'host'),
        DB_PORT: ecs.Secret.fromSecretsManager(db.secret!, 'port'),
        DB_USER: ecs.Secret.fromSecretsManager(db.secret!, 'username'),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(db.secret!, 'password'),
        DB_NAME: ecs.Secret.fromSecretsManager(db.secret!, 'dbname'),
        SESSION_SECRET: ecs.Secret.fromSecretsManager(appSecrets['session-secret'], 'value'),
        TOKEN_PEPPER: ecs.Secret.fromSecretsManager(appSecrets['token-pepper'], 'value'),
        DATA_ENCRYPTION_KEY: ecs.Secret.fromSecretsManager(appSecrets['data-encryption-key'], 'value'),
        SMTP_HOST: ecs.Secret.fromSecretsManager(appSecrets['smtp-host'], 'value'),
        SMTP_PORT: ecs.Secret.fromSecretsManager(appSecrets['smtp-port'], 'value'),
        SMTP_USER: ecs.Secret.fromSecretsManager(appSecrets['smtp-user'], 'value'),
        SMTP_PASSWORD: ecs.Secret.fromSecretsManager(appSecrets['smtp-password'], 'value'),
        EMAIL_FROM: ecs.Secret.fromSecretsManager(appSecrets['email-from'], 'value'),
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'api',
        logGroup: apiLogGroup,
      }),
    });

    const service = new ecs.FargateService(this, 'ApiService', {
      cluster,
      taskDefinition: taskDef,
      desiredCount: config.desiredCount,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [taskSg],
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      healthCheckGracePeriod: Duration.seconds(120),
      circuitBreaker: { rollback: true },
      serviceName: 'interscale-travel-crm-prod-api',
    });
    service.attachToApplicationTargetGroup(targetGroup);

    // ----------------------------------------------------------- Outputs
    new CfnOutput(this, 'AlbDnsName', { value: alb.loadBalancerDnsName });
    new CfnOutput(this, 'EcrRepositoryUri', { value: repo.repositoryUri });
    new CfnOutput(this, 'EcsClusterName', { value: cluster.clusterName });
    new CfnOutput(this, 'EcsServiceName', { value: service.serviceName });
    new CfnOutput(this, 'FilesBucketName', { value: filesBucket.bucketName });
    new CfnOutput(this, 'RdsEndpoint', { value: db.dbInstanceEndpointAddress });
    new CfnOutput(this, 'DbSecretArn', { value: db.secret?.secretArn ?? '' });
    new CfnOutput(this, 'ApiLogGroupName', { value: apiLogGroup.logGroupName });
    new CfnOutput(this, 'MigrationLogGroupName', { value: migrationLogGroup.logGroupName });
  }
}

/** Secrets referenced by the API task, all created before stack deploy. */
export const APP_SECRET_NAMES = [
  'session-secret',
  'token-pepper',
  'data-encryption-key',
  'smtp-host',
  'smtp-port',
  'smtp-user',
  'smtp-password',
  'email-from',
] as const;

function secretByName(config: DeployConfig, stack: Stack, name: string): secretsmanager.ISecret {
  const fullArn = config.appSecretArns[name];
  if (!fullArn) {
    throw new Error(`Missing app secret ARN for ${name}`);
  }
  return secretsmanager.Secret.fromSecretCompleteArn(stack, `Secret${name.replace(/-/g, '')}`, fullArn);
}
