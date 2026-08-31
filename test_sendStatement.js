require("dotenv").config();
const { sendStatement } = require("./users/controller/email.controller");

/**
 * Creates mock Express Request and Response objects
 * @param {object} payload - Request body payload { pin, from, to, sendToEmail }
 * @returns {{ req: object, res: object, promise: Promise<{statusCode: number, data: any}> }}
 */
function createMockReqRes(payload) {
    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });

    let statusCode = 200;

    const req = {
        params: {},
        query: {},
        body: { ...payload },
        headers: {}
    };

    const res = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            statusCode = code;
            return this;
        },
        json(data) {
            resolvePromise({ statusCode, data });
            return this;
        },
        send(data) {
            resolvePromise({ statusCode, data });
            return this;
        },
        end() {
            resolvePromise({ statusCode, data: null });
            return this;
        }
    };

    return { req, res, promise };
}

/**
 * Test function that invokes sendStatement with statement parameters
 * @param {object} params
 * @param {string} params.pin - RSA PIN
 * @param {string} params.from - Start date (YYYY-MM-DD or MM/DD/YYYY)
 * @param {string} params.to - End date (YYYY-MM-DD or MM/DD/YYYY)
 * @param {string} params.sendToEmail - Destination recipient email address
 * @returns {Promise<{statusCode: number, data: any, durationMs: number}>}
 */
async function testSendStatement({ pin, from, to, sendToEmail }) {
    if (!pin || !from || !to || !sendToEmail) {
        throw new Error("Missing required fields: 'pin', 'from', 'to', and 'sendToEmail' must all be provided.");
    }

    const { req, res, promise } = createMockReqRes({ pin, from, to, sendToEmail });
    const startTime = Date.now();

    try {
        console.log("\n=======================================================");
        console.log("🧪 [TEST RUNNER] Testing sendStatement");
        console.log("=======================================================");
        console.log(`📌 PIN:         ${pin}`);
        console.log(`📅 Date Range:  ${from}  -->  ${to}`);
        console.log(`📧 Send Email:  ${sendToEmail}`);
        console.log("-------------------------------------------------------");
        console.log("⏳ Processing stored procedure, generating PDF & emailing...");

        // Execute controller function
        sendStatement(req, res).catch(err => {
            console.error("Unhandled error inside sendStatement:", err);
        });

        // 60s timeout for PDF generation and email sending
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Test timed out after 60 seconds")), 60000)
        );

        const result = await Promise.race([promise, timeoutPromise]);
        const durationMs = Date.now() - startTime;

        console.log("\n-------------------------------------------------------");
        console.log(`⏱️  Duration: ${durationMs}ms`);
        console.log(`📊 HTTP Status: ${result.statusCode}`);
        console.log("📦 Response Payload:\n", JSON.stringify(result.data, null, 2));
        console.log("-------------------------------------------------------");

        if (result.statusCode >= 200 && result.statusCode < 300) {
            console.log("✅ TEST PASSED: Statement generated and email sent successfully!\n");
        } else {
            console.warn(`⚠️ TEST RETURNED HTTP STATUS ${result.statusCode}.\n`);
        }

        return { ...result, durationMs };
    } catch (error) {
        const durationMs = Date.now() - startTime;
        console.error(`\n❌ TEST FAILED after ${durationMs}ms:`, error.message);
        throw error;
    }
}

// Support direct CLI execution: node test_sendStatement.js [pin] [from] [to] [sendToEmail]
if (require.main === module) {
    // Default values if not supplied via command line arguments
    const defaultPayload = {
        pin: process.argv[2] || "PEN100000000001",
        from: process.argv[3] || "2024-01-01",
        to: process.argv[4] || "2024-12-31",
        sendToEmail: process.argv[5] || "user@example.com"
    };

    if (!process.argv[2] || !process.argv[3] || !process.argv[4] || !process.argv[5]) {
        console.log("💡 Usage: node test_sendStatement.js <PIN> <FROM_DATE> <TO_DATE> <RECIPIENT_EMAIL>");
        console.log("ℹ️  Using default/sample values for demonstration:\n", defaultPayload, "\n");
    }

    testSendStatement(defaultPayload)
        .then(() => {
            console.log("🏁 Test execution finished.");
            process.exit(0);
        })
        .catch(() => {
            process.exit(1);
        });
}

module.exports = {
    testSendStatement,
    createMockReqRes
};
