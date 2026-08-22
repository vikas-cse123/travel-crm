import { Stack, type StackProps } from 'aws-cdk-lib';
import { type Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { type DeployConfig } from '../config.js';

export interface YourQuotationStackProps extends StackProps {
  config: DeployConfig;
}

/**
 * Quotation-friendly domain `yourquotation.in` — ADDITIVE, quotation-only.
 *
 * Reuses the existing ALB, VPC, cluster, listener, frontend and API target
 * groups. No new ECS service, task definition, VPC, or ALB is created.
 * Attaches the existing `yourquotation.in + www.yourquotation.in` ACM
 * certificate via SNI and adds four host-specific listener rules:
 *
 *   41  www.yourquotation.in  → 301 redirect to https://yourquotation.in/#{path}?#{query}
 *   52  yourquotation.in + /crm-assets, /crm-assets/* → Frontend TG (CRM bundle)
 *   53  yourquotation.in + /api, /api/*               → API TG (same-origin /api for public weblink)
 *   54  yourquotation.in + /*                         → Frontend TG (SPA fallback for /:slug)
 *
 * Priorities 41/52/53/54 are chosen as free gaps between existing rules:
 *   10 origin-verify → API, 20 app /api → API, 30 app /* → Frontend,
 *   40 www.travelagencycrm.in → redirect, 44-50 travelagencycrm.in (marketing + friendly slug),
 *   60/70 custom-host fallback. No existing rule uses 41,52-54.
 *
 * Existing behaviour is preserved:
 *  - travelagencycrm.in / www.travelagencycrm.in rules (40,44-50) unchanged
 *  - app.travelagencycrm.in rules (20,30) unchanged
 *  - custom-domain catch-all (60,70) unchanged, lower priority than 41/52-54
 *  - vite `assetsDir=crm-assets` and nginx `/crm-assets/` stay untouched
 */
export class YourQuotationStack extends Stack {
  constructor(scope: Construct, id: string, props: YourQuotationStackProps) {
    super(scope, id, props);
    const { config } = props;

    if (!config.vpcId || !config.clusterArn || !config.listenerArn) {
      throw new Error('YourQuotationStack requires existing backend resource references in config.');
    }
    if (!config.yourQuotationCertArn) {
      throw new Error('YourQuotationStack requires yourQuotationCertArn (ACM for yourquotation.in).');
    }

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
    void cluster;

    const listener = elbv2.ApplicationListener.fromApplicationListenerAttributes(this, 'Listener', {
      listenerArn: config.listenerArn,
      securityGroup: albSg,
      defaultPort: 443,
    });

    const apiTargetGroup = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(this, 'ApiTargetGroup', {
      targetGroupArn: config.apiTargetGroupArn,
    });
    const frontendTargetGroup = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(
      this,
      'FrontendTargetGroup',
      { targetGroupArn: config.frontendTargetGroupArn },
    );

    const yourQuotationCertificate = acm.Certificate.fromCertificateArn(
      this,
      'YourQuotationCertificate',
      config.yourQuotationCertArn,
    );

    // SNI: attach yourquotation.in + www.yourquotation.in cert alongside existing certs.
    listener.addCertificates('YourQuotationCertificateAttachment', [yourQuotationCertificate]);

    // 41: www.yourquotation.in → 301 to apex, preserving path and query (like marketing 40).
    listener.addAction('YourQuotationWwwRedirectRule', {
      priority: 41,
      conditions: [elbv2.ListenerCondition.hostHeaders([config.yourQuotationWwwDomain])],
      action: elbv2.ListenerAction.redirect({
        host: config.yourQuotationDomain,
        path: '/#{path}',
        query: '#{query}',
        protocol: 'HTTPS',
        permanent: true,
      }),
    });

    const yourQuotationHost = () => elbv2.ListenerCondition.hostHeaders([config.yourQuotationDomain]);

    // 52: CRM bundle assets must go to frontend TG, not marketing. Explicit host rule prevents blank page.
    listener.addAction('YourQuotationCrmAssetsRule', {
      priority: 52,
      conditions: [
        yourQuotationHost(),
        elbv2.ListenerCondition.pathPatterns(['/crm-assets', '/crm-assets/*']),
      ],
      action: elbv2.ListenerAction.forward([frontendTargetGroup]),
    });

    // 53: same-origin /api for public weblink → API TG (PublicQuotationPage fetches /api/public/quotations/... same-origin).
    listener.addAction('YourQuotationApiRule', {
      priority: 53,
      conditions: [yourQuotationHost(), elbv2.ListenerCondition.pathPatterns(['/api', '/api/*'])],
      action: elbv2.ListenerAction.forward([apiTargetGroup]),
    });

    // 54: everything else (including /:slug friendly quotation) → CRM frontend SPA, where AppRoutes `/:slug` renders PublicQuotationPage.
    listener.addAction('YourQuotationFrontendRule', {
      priority: 54,
      conditions: [yourQuotationHost()],
      action: elbv2.ListenerAction.forward([frontendTargetGroup]),
    });
  }
}
