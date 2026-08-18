/**
 * Shared deployment configuration for the Interscale Travel CRM AWS stacks.
 *
 * Secrets (origin verification header, generated application secrets) are
 * injected at deploy time via CDK context (`-c originVerify=...`). They are
 * never stored in this file, cdk.json, or stack outputs. Certificate ARNs are
 * non-secret identifiers and may be passed via context.
 */
export interface DeployConfig {
  /** Public application domain (CloudFront). */
  appDomain: string;
  /** Origin-only domain used for CloudFront -> ALB HTTPS. */
  originDomain: string;
  /** Environment label. */
  environment: string;
  /** Resource name prefix. */
  projectPrefix: string;
  /** Account ID derived from the bootstrapped environment. */
  account: string;
  /** Region for API/data resources. */
  region: string;
  /** Region for the CloudFront viewer certificate. */
  certRegion: string;
  /** ARN of the us-east-1 viewer certificate for app.travelagencycrm.in. */
  viewerCertArn: string;
  /** ARN of the ap-south-1 origin certificate for origin.app.travelagencycrm.in. */
  originCertArn: string;
  /** Shared secret CloudFront sends to the ALB origin (never printed). */
  originVerify: string;
  /** Full ARNs (including the random suffix) of the API secrets. */
  appSecretArns: Record<string, string>;
  /** Initial ECS desired count (0 until migrations complete). */
  desiredCount: number;
  /** Immutable image tag for this deployment. */
  imageTag: string;
  /** ECR repository name. */
  repoName: string;
  /** Existing ALB DNS hostname (public endpoint). */
  albDnsName: string;
  /** Existing HTTPS listener ARN. */
  listenerArn: string;
  /** Existing ALB security-group id. */
  albSecurityGroupId: string;
  /** Existing API target-group ARN. */
  apiTargetGroupArn: string;
  /** Existing frontend target-group ARN (created by the frontend stack). */
  frontendTargetGroupArn: string;
  /** Existing ECS cluster name. */
  clusterName: string;
  /** Existing ECS cluster ARN. */
  clusterArn: string;
  /** Existing production VPC id. */
  vpcId: string;
  /** Public subnet ids used by the API service (comma separated). */
  publicSubnetIds: string[];
  /** Frontend ECR repository ARN (created directly). */
  frontendRepoArn: string;
  /** ap-south-1 ACM certificate for app.travelagencycrm.in. */
  appCertArn: string;
  /** Marketing public root domain (apex). */
  marketingDomain: string;
  /** Marketing www domain. */
  marketingWwwDomain: string;
  /** Marketing ECR repository ARN. */
  marketingRepoArn: string;
  /** Marketing ECR repository name. */
  marketingRepoName: string;
  /** ap-south-1 ACM certificate for travelagencycrm.in + www.travelagencycrm.in. */
  marketingCertArn: string;
  /** Marketing task execution role ARN. */
  marketingExecRoleArn: string;
  /** Marketing task role ARN. */
  marketingTaskRoleArn: string;
  /** Marketing ECS service ARN. */
  ecsMarketingServiceArn: string;
  /** Marketing log group ARN (for deployment diagnostics). */
  marketingLogGroupArn: string;
  /** GitHub repository owner. */
  githubOwner: string;
  /** GitHub repository name. */
  githubRepo: string;
  /** API ECR repository ARN. */
  ecrApiRepoArn: string;
  /** API task execution role ARN. */
  apiExecRoleArn: string;
  /** API application task role ARN. */
  apiTaskRoleArn: string;
  /** Frontend task execution role ARN. */
  frontendExecRoleArn: string;
  /** Frontend task role ARN. */
  frontendTaskRoleArn: string;
  /** ECS cluster ARN. */
  ecsClusterArn: string;
  /** API ECS service ARN. */
  ecsApiServiceArn: string;
  /** Frontend ECS service ARN. */
  ecsFrontendServiceArn: string;
  /** API log group ARN (for deployment diagnostics). */
  apiLogGroupArn: string;
  /** Frontend log group ARN. */
  frontendLogGroupArn: string;
  /** Migration log group ARN. */
  migrationLogGroupArn: string;
}

const account = process.env.CDK_DEFAULT_ACCOUNT ?? '148820520842';
const region = 'ap-south-1';
const certRegion = 'us-east-1';

export const config: DeployConfig = {
  appDomain: 'app.travelagencycrm.in',
  originDomain: 'origin.app.travelagencycrm.in',
  environment: 'production',
  projectPrefix: 'interscale-travel-crm-prod',
  account,
  region,
  certRegion,
  viewerCertArn: process.env.VIEWER_CERT_ARN ?? '',
  originCertArn: process.env.ORIGIN_CERT_ARN ?? '',
  originVerify: process.env.ORIGIN_VERIFY ?? '',
  appSecretArns: {
    'session-secret': process.env.SECRET_SESSION ?? '',
    'token-pepper': process.env.SECRET_TOKEN_PEPPER ?? '',
    'data-encryption-key': process.env.SECRET_DATA_ENCRYPTION_KEY ?? '',
    'smtp-host': process.env.SECRET_SMTP_HOST ?? '',
    'smtp-port': process.env.SECRET_SMTP_PORT ?? '',
    'smtp-user': process.env.SECRET_SMTP_USER ?? '',
    'smtp-password': process.env.SECRET_SMTP_PASSWORD ?? '',
    'email-from': process.env.SECRET_EMAIL_FROM ?? '',
  },
  desiredCount: Number(process.env.ECS_DESIRED_COUNT ?? '0'),
  imageTag: process.env.IMAGE_TAG ?? 'latest',
  repoName: process.env.ECR_REPO_NAME ?? 'interscale-travel-crm-prod-api',
  albDnsName: process.env.ALB_DNS_NAME ?? '',
  listenerArn: process.env.LISTENER_ARN ?? '',
  albSecurityGroupId: process.env.ALB_SG_ID ?? '',
  apiTargetGroupArn: process.env.API_TG_ARN ?? '',
  frontendTargetGroupArn: process.env.FRONTEND_TG_ARN ?? '',
  clusterName: process.env.ECS_CLUSTER_NAME ?? '',
  clusterArn: process.env.ECS_CLUSTER_ARN ?? '',
  vpcId: process.env.VPC_ID ?? '',
  publicSubnetIds: (process.env.PUBLIC_SUBNET_IDS ?? '').split(',').filter(Boolean),
  frontendRepoArn: process.env.FRONTEND_REPO_ARN ?? '',
  appCertArn: process.env.APP_CERT_ARN ?? '',
  marketingDomain: process.env.MARKETING_DOMAIN ?? 'travelagencycrm.in',
  marketingWwwDomain: process.env.MARKETING_WWW_DOMAIN ?? 'www.travelagencycrm.in',
  marketingRepoArn: process.env.MARKETING_REPO_ARN ?? '',
  marketingRepoName: process.env.MARKETING_REPO_NAME ?? 'interscale-travel-crm-prod-marketing',
  marketingCertArn: process.env.MARKETING_CERT_ARN ?? '',
  marketingExecRoleArn: process.env.MARKETING_EXEC_ROLE_ARN ?? '',
  marketingTaskRoleArn: process.env.MARKETING_TASK_ROLE_ARN ?? '',
  ecsMarketingServiceArn: process.env.ECS_MARKETING_SERVICE_ARN ?? '',
  marketingLogGroupArn: process.env.MARKETING_LOG_GROUP_ARN ?? '',
  githubOwner: process.env.GITHUB_OWNER ?? '',
  githubRepo: process.env.GITHUB_REPO ?? '',
  ecrApiRepoArn: process.env.ECR_API_REPO_ARN ?? '',
  apiExecRoleArn: process.env.API_EXEC_ROLE_ARN ?? '',
  apiTaskRoleArn: process.env.API_TASK_ROLE_ARN ?? '',
  frontendExecRoleArn: process.env.FRONTEND_EXEC_ROLE_ARN ?? '',
  frontendTaskRoleArn: process.env.FRONTEND_TASK_ROLE_ARN ?? '',
  ecsClusterArn: process.env.ECS_CLUSTER_ARN ?? '',
  ecsApiServiceArn: process.env.ECS_API_SERVICE_ARN ?? '',
  ecsFrontendServiceArn: process.env.ECS_FRONTEND_SERVICE_ARN ?? '',
  apiLogGroupArn: process.env.API_LOG_GROUP_ARN ?? '',
  frontendLogGroupArn: process.env.FRONTEND_LOG_GROUP_ARN ?? '',
  migrationLogGroupArn: process.env.MIGRATION_LOG_GROUP_ARN ?? '',
};
