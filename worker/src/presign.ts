import { AwsClient } from "aws4fetch";
import { PRESIGN_KEY_TTL_SECONDS } from "./constants.js";

const PRESIGNED_EXPIRES = 120; // seconds

export function generateUploadKey(): string {
  const uuid = crypto.randomUUID();
  return `uploads/${uuid}`;
}

export async function createPresignedPutUrl(
  key: string,
  accountId: string,
  bucketName: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<string> {
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const url = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}?X-Amz-Expires=${PRESIGNED_EXPIRES}`;
  const signed = await client.sign(new Request(url, { method: "PUT" }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

export const UPLOAD_KEY_TTL = PRESIGN_KEY_TTL_SECONDS;
