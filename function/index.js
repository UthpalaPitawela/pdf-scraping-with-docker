const { webkit, chromium, firefox } = require("playwright");
const fs = require("fs");
const pdf = require("pdf-parse");
const path = require("path");
const AWS = require("aws-sdk");
const axios = require("axios");
const crypto = require("crypto");
// Example usage

// Initialize AWS SDK with configured credentials and region
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_DEFAULT_REGION
});

const ssm = new AWS.SSM();

getCustomExecutablePath = (expectedPath) => {
  const suffix = expectedPath.split("/ms-playwright/")[1];
  return `/ms-playwright/${suffix}`;
};

exports.handler = async (event, context) => {
  const browserName = "chromium";
  // const browserName = event.browser || 'chromium';
  const extraLaunchArgs = event.browserArgs || [];
  const browserTypes = {
    webkit: webkit,
    chromium: chromium,
    firefox: firefox,
  };
  const browserLaunchArgs = {
    webkit: [],
    chromium: ["--single-process"],
    firefox: [],
  };
  let browser = null;
  try {
    console.log(`Starting browser: ${browserName}`);
    browser = await browserTypes[browserName].launch({
      executablePath: getCustomExecutablePath(
        browserTypes[browserName].executablePath()
      ),
      args: browserLaunchArgs[browserName].concat(extraLaunchArgs),
    });
    console.log("=============Starting crawling===============");
    const context = await browser.newContext();
    const page = await context.newPage();
    console.log("==============Directing to the crawling website===========");
    await page.goto(
      "https://mfa.gov.lk/certificates-of-births-marriages-and-deaths/?fbclid=IwZXh0bgNhZW0CMTAAAR3ZbfM0rBySINGG72RXC5V-Srbcu5J--LUq9T2O9yl0CN01kI98Z7BcPzQ_aem_AUyU9oLD20bXRp_swaIzh2I9sxSCRAdAD71WRSPbF4dtwncgP-r3IYSFsxEOaSfQzvWsnnBWUuHeOP00d67C7xTD"
    );
    // Wait for the download event and click on a link to download the PDF file
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "click here" }).click(),
    ]);
    console.log("=============save the pdf locally=============");
    // Use the suggested filename from the download event to save the file
    const tmpFilePath = path.join("/tmp", download.suggestedFilename());

    // Save the download to a temporary path
    await download.saveAs(tmpFilePath);
    const exportDir = path.join("/tmp", "ExportData");
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const finalFilePath = path.join(exportDir, "Consular-Guidlines-New.pdf");

    // Move the file to the final destination
    fs.renameSync(tmpFilePath, finalFilePath);
    // Use the 'pdf-parse' module to extract the text from the PDF file
    const dataBuffer = fs.readFileSync(finalFilePath);
    console.log("=================sending data to s3================");

    const preSignedUrl = await getSignedUrl();
    const response = await putToS3(preSignedUrl, dataBuffer);

    if (response.ok) {
      const text = await response.text();
    } else {
      const error = await response.json();
    }

    await page.waitForTimeout(600000);
  } catch (error) {
    console.log(`error${error}`);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

//The below code related to add data to the s3 bucket using a presigned url
const putToS3 = async (url, data) => {
  return await fetch(url, {
    method: "PUT",
    body: data,
    headers: {
      "Content-Type": "application/octet-stream",
    },
  });
};

const getSignedUrl = async () => {
  const accessKey = await getAccessKey();
  console.log('accessKey¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬', accessKey)
  const secretKey = await getSecretAccessKey();
  console.log('secretKey¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬', secretKey)
  const region = await getRegion();
  console.log('region¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬¬', region)
  const service = "execute-api";
  const credentials = new AWS.Credentials(accessKey, secretKey);
  // AWS.config.update({ region: region });
  const requestPayload = JSON.stringify({
    uploadType: "DOCUMENT",
    mimeType: "application/pdf",
  });

  try {
    const amzDate =
      new Date()
        .toISOString()
        .replace(/[:\-]|\.\d{3}/g, "")
        .slice(0, 15) + "Z";
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

    // Authorization header
    const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${dateStamp}/${region}/${service}/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const response = await axios.post(
      "https://n5fp6dyzhl.execute-api.us-east-1.amazonaws.com/develop/organizations/fef07aad-6bf2-48eb-be07-b0bcdf373fa0/files/signed-url",
      // `${endpoint.replace('{organizationId}', organizationId)}`,
      requestPayload,
      {
        headers: {
          "Content-Type": "application/json",
          "x-amz-date": amzDate,
          Authorization: authorizationHeader,
        },
      }
    );
    console.log("response", response);
    // Log the response status code
    console.log("Response Status Code:", response.status);

    const responseData = response.data;
    console.log("Response Data:", responseData);
    // Extract the signed URL (adjust this based on the actual response structure)
    const signedUrl = responseData.signedURL; // Ensure this matches the key in your response data
    return signedUrl;
  } catch (error) {
    console.error("Error fetching organization ID:", error);
    throw error;
  }
};

const getAccessKey = async () => {
  try {
    const ssm = new AWS.SSM();
    const parameter = await ssm.getParameter({ 
      Name: '/zitles/dev/scraping/accesskey', 
      WithDecryption: false 
      }).promise();
    return parameter.Parameter.Value;
  } catch (err) {
    console.error("Error retrieving parameters:", err);
    throw err;
  }
};
const getSecretAccessKey = async () => {
  try {
    const ssm = new AWS.SSM();
    const parameter = await ssm.getParameter({ 
      Name: '/zitles/dev/scraping/secretKey', 
      WithDecryption: false 
      }).promise();
    return parameter.Parameter.Value;
  } catch (err) {
    console.error("Error retrieving parameters:", err);
    throw err;
  }
};
const getRegion = async () => {
  try {
    const ssm = new AWS.SSM();
    const parameter = await ssm.getParameter({ 
      Name: '/zitles/dev/scraping/region', 
      WithDecryption: false 
      }).promise();
    return parameter.Parameter.Value;
  } catch (err) {
    console.error("Error retrieving parameters:", err);
    throw err;
  }
};