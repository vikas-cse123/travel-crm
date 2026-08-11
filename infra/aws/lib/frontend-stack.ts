import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { type Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { type DeployConfig } from '../config.js';

export interface FrontendStackProps extends StackProps {
  config: DeployConfig;
  albDnsName: string;
}

/** CloudFront Function: safe SPA route rewrite for extensionless paths. */
export function spaRewriteFunctionCode(): string {
  return `
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Never rewrite API or public-quotation data paths.
  if (uri.startsWith('/api/') || uri.startsWith('/public/')) return request;
  // Never rewrite paths that already look like static files (they have an
  // extension such as /assets/app-hash.js or /favicon.ico).
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  if (lastSegment.indexOf('.') !== -1) return request;

  request.uri = '/index.html';
  return request;
}`.trim();
}

export class FrontendStack extends Stack {
  readonly distributionId: string;
  readonly distributionDomain: string;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);
    const { config, albDnsName } = props;

    // ------------------------------------------------- Frontend S3 origin
    // The production frontend bucket is created directly (it predates the
    // CloudFront distribution, which requires account verification). Import it
    // here so CloudFormation adopts it instead of attempting to re-create it.
    const webBucketName = `interscale-travel-crm-prod-frontend-${this.account}`;
    const webBucket = s3.Bucket.fromBucketName(this, 'WebBucket', webBucketName);

    const oac = new cloudfront.S3OriginAccessControl(this, 'Oac', {
      originAccessControlName: 'interscale-travel-crm-prod-s3-oac',
      signing: cloudfront.Signing.SIGV4_ALWAYS,
      description: 'OAC for the private SPA bucket',
    });

    const viewerCertificate = acm.Certificate.fromCertificateArn(
      this,
      'ViewerCert',
      config.viewerCertArn,
    );

    const originVerifyValue = config.originVerify;

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      certificate: viewerCertificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      domainNames: [config.appDomain],
      enabled: true,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      comment: `Interscale Travel CRM production (${config.appDomain})`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          {
            function: new cloudfront.Function(this, 'SpaRewrite', {
              code: cloudfront.FunctionCode.fromInline(spaRewriteFunctionCode()),
              runtime: cloudfront.FunctionRuntime.JS_2_0,
            }),
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
            httpPort: 80,
            httpsPort: 443,
            customHeaders: { 'X-Origin-Verify': originVerifyValue },
            originShieldRegion: config.region,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        },
        '/public/*': {
          origin: new origins.HttpOrigin(albDnsName, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
            originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
            httpPort: 80,
            httpsPort: 443,
            customHeaders: { 'X-Origin-Verify': originVerifyValue },
            originShieldRegion: config.region,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        },
      },
    });

    this.distributionId = distribution.distributionId;
    this.distributionDomain = distribution.distributionDomainName;

    // The frontend bucket is imported (created directly, ahead of CloudFront),
    // so CloudFormation cannot manage its policy through the Bucket construct.
    // Grant the distribution's Origin Access Control read access explicitly.
    new s3.BucketPolicy(this, 'WebBucketPolicy', {
      bucket: webBucket,
    }).document.addStatements(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [webBucket.arnForObjects('*')],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': distribution.distributionArn,
          },
        },
      }),
    );

    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new CfnOutput(this, 'DistributionDomain', { value: distribution.distributionDomainName });
    new CfnOutput(this, 'WebBucketName', { value: webBucket.bucketName });
  }
}
