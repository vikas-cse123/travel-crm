import {
  ACMClient,
  DeleteCertificateCommand,
  DescribeCertificateCommand,
  RequestCertificateCommand,
} from '@aws-sdk/client-acm';
import {
  AddListenerCertificatesCommand,
  DescribeListenerCertificatesCommand,
  ElasticLoadBalancingV2Client,
  RemoveListenerCertificatesCommand,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { env } from '../../config/env.js';

/**
 * AWS provisioning for custom domains (Phase 3). Thin wrappers over ACM and
 * ELBv2 so route handlers never touch AWS directly. The HTTPS listener ARN
 * comes from configuration; certificates are attached/detached on that single
 * shared listener — no per-customer infrastructure is created.
 */

function acmClient(): ACMClient {
  return new ACMClient({ region: env.AWS_REGION });
}

function elbv2Client(): ElasticLoadBalancingV2Client {
  return new ElasticLoadBalancingV2Client({ region: env.AWS_REGION });
}

export interface AcmValidationRecord {
  name: string;
  type: string;
  value: string;
}

export interface AcmDescribeResult {
  status: string;
  validationRecord: AcmValidationRecord | null;
}

/** Request a DNS-validated ACM certificate for exactly this hostname. */
export async function requestCertificate(hostname: string): Promise<string> {
  const result = await acmClient().send(
    new RequestCertificateCommand({
      DomainName: hostname,
      ValidationMethod: 'DNS',
      Tags: [{ Key: 'crm:custom-domain', Value: 'true' }],
    }),
  );
  const arn = result.CertificateArn;
  if (!arn) throw new Error('ACM did not return a certificate ARN.');
  return arn;
}

/** Describe an ACM certificate and surface its DNS validation record. */
export async function describeCertificate(certificateArn: string): Promise<AcmDescribeResult> {
  const result = await acmClient().send(
    new DescribeCertificateCommand({ CertificateArn: certificateArn }),
  );
  const cert = result.Certificate;
  const record =
    cert?.DomainValidationOptions?.[0]?.ResourceRecord ??
    cert?.DomainValidationOptions?.[0]?.ResourceRecord ??
    null;
  return {
    status: cert?.Status ?? 'UNKNOWN',
    validationRecord: record
      ? {
          name: record.Name ?? '',
          type: record.Type ?? 'CNAME',
          value: record.Value ?? '',
        }
      : null,
  };
}

/** Attach a certificate to the configured HTTPS listener (idempotent). */
export async function attachCertificate(certificateArn: string): Promise<void> {
  const listenerArn = env.CUSTOM_DOMAIN_HTTPS_LISTENER_ARN;
  if (!listenerArn) throw new Error('CUSTOM_DOMAIN_HTTPS_LISTENER_ARN is not configured.');
  await elbv2Client().send(
    new AddListenerCertificatesCommand({
      ListenerArn: listenerArn,
      Certificates: [{ CertificateArn: certificateArn }],
    }),
  );
}

/** Detach a certificate from the configured HTTPS listener (idempotent). */
export async function detachCertificate(certificateArn: string): Promise<void> {
  const listenerArn = env.CUSTOM_DOMAIN_HTTPS_LISTENER_ARN;
  if (!listenerArn) throw new Error('CUSTOM_DOMAIN_HTTPS_LISTENER_ARN is not configured.');
  await elbv2Client().send(
    new RemoveListenerCertificatesCommand({
      ListenerArn: listenerArn,
      Certificates: [{ CertificateArn: certificateArn }],
    }),
  );
}

/** Whether the certificate is already attached to the configured listener. */
export async function isCertificateAttached(certificateArn: string): Promise<boolean> {
  const listenerArn = env.CUSTOM_DOMAIN_HTTPS_LISTENER_ARN;
  if (!listenerArn) return false;
  const result = await elbv2Client().send(
    new DescribeListenerCertificatesCommand({ ListenerArn: listenerArn }),
  );
  return (result.Certificates ?? []).some(
    (entry) => entry.CertificateArn === certificateArn,
  );
}

/** Delete an ACM certificate. Throws on AWS failure; callers clean up best-effort. */
export async function deleteCertificate(certificateArn: string): Promise<void> {
  await acmClient().send(new DeleteCertificateCommand({ CertificateArn: certificateArn }));
}
