import { S3Client } from "@aws-sdk/client-s3";

export const R2_BUCKET = "rahulvaidun";
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL ?? "";

let cachedClient: S3Client | null = null;

export function getR2Client(): S3Client {
  if (cachedClient) return cachedClient;

  cachedClient = new S3Client({
    region: "auto",
    endpoint: process.env.R2_S3_API_URL,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
  });

  return cachedClient;
}

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_S3_API_URL &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    R2_PUBLIC_URL,
  );
}
