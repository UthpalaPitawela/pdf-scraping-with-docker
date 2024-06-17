const AWS = require("aws-sdk");
const crypto = require("crypto");

const getAmzDate = () => {
  const amzDate =
    new Date()
      .toISOString()
      .replace(/[:\-]|\.\d{3}/g, "")
      .slice(0, 15) + "Z";
  return amzDate;
};

const createAuthorizationHeader = async () => {
  const accessKey = await getAccessKey();
  console.log("accessKey¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬", accessKey);
  const secretKey = await getSecretAccessKey();
  console.log("secretKey¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬", secretKey);
  const region = await getRegion();
  console.log("region¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬", region);
  const service = "execute-api";
  // const credentials = new AWS.Credentials(accessKey, secretKey);
  const requestPayload = createRequestPayload();
  const amzDate = getAmzDate();
  const dateStamp = amzDate.substring(0, 8);
  // Canonical request headers
  const canonicalHeaders = `content-type:application/json\nhost:n5fp6dyzhl.execute-api.us-east-1.amazonaws.com\nx-amz-date:${amzDate}\n`;

  // Signed headers
  const signedHeaders = "content-type;host;x-amz-date";

  // Hash the payload
  const payloadHash = crypto
    .createHash("sha256")
    .update(requestPayload)
    .digest("hex");

  // Canonical request
  const canonicalRequest = `POST\n/develop/organizations/fef07aad-6bf2-48eb-be07-b0bcdf373fa0/files/signed-url\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  // String to sign
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${dateStamp}/${region}/${service}/aws4_request\n${crypto
    .createHash("sha256")
    .update(canonicalRequest)
    .digest("hex")}`;

  // Calculate the signing key
  const kDate = crypto
    .createHmac("sha256", "AWS4" + secretKey)
    .update(dateStamp)
    .digest();
  const kRegion = crypto.createHmac("sha256", kDate).update(region).digest();
  const kService = crypto
    .createHmac("sha256", kRegion)
    .update(service)
    .digest();
  const kSigning = crypto
    .createHmac("sha256", kService)
    .update("aws4_request")
    .digest();

  // Signature
  const signature = crypto
    .createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${dateStamp}/${region}/${service}/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return authorizationHeader;
};

const getAccessKey = async () => {
  try {
    const ssm = new AWS.SSM();
    const parameter = await ssm
      .getParameter({
        Name: "/zitles/dev/scraping/accesskey",
        WithDecryption: false,
      })
      .promise();
    return parameter.Parameter.Value;
  } catch (err) {
    console.error("Error retrieving parameters:", err);
    throw err;
  }
};
const getSecretAccessKey = async () => {
  try {
    const ssm = new AWS.SSM();
    const parameter = await ssm
      .getParameter({
        Name: "/zitles/dev/scraping/secretKey",
        WithDecryption: false,
      })
      .promise();
    return parameter.Parameter.Value;
  } catch (err) {
    console.error("Error retrieving parameters:", err);
    throw err;
  }
};
const getRegion = async () => {
  try {
    const ssm = new AWS.SSM();
    const parameter = await ssm
      .getParameter({
        Name: "/zitles/dev/scraping/region",
        WithDecryption: false,
      })
      .promise();
    return parameter.Parameter.Value;
  } catch (err) {
    console.error("Error retrieving parameters:", err);
    throw err;
  }
};

const createRequestPayload = () => {
  const requestPayload = JSON.stringify({
    uploadType: "DOCUMENT",
    mimeType: "application/pdf",
  });
  return requestPayload;
};

module.exports = {
  createAuthorizationHeader: createAuthorizationHeader,
  createRequestPayload: createRequestPayload,
  getAmzDate: getAmzDate,
};
