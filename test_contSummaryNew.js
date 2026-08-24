require("dotenv").config();
const { contSummaryNew } = require("./users/controller/contributions.controller");

/**
 * Creates mock Express Request and Response objects
 * @param {string} pin - RSA PIN or Mobile Phone to test
 * @returns {{ req: object, res: object, promise: Promise<{statusCode: number, data: any}> }}
 */
function createMockReqRes(pin) {
    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });

    let statusCode = 200;

    const req = {
        params: { pin },
        query: {},
        body: {},
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
 * Test function that invokes contSummaryNew with a given PIN
 * @param {string} pin - RSA PIN or phone number
 * @returns {Promise<{statusCode: number, data: any, durationMs: number}>}
 */
async function testContSummaryNew(pin) {
    if (!pin) {
        throw new Error("A valid PIN or phone number must be provided for testing.");
    }

    const { req, res, promise } = createMockReqRes(pin);
    const startTime = Date.now();

    try {
        console.log("\n=======================================================");
        console.log(`🧪 [TEST RUNNER] Testing contSummaryNew for PIN: "${pin}"`);
        console.log("=======================================================");

        // Execute controller function
        contSummaryNew(req, res).catch(err => {
            console.error("Unhandled error inside contSummaryNew:", err);
        });

        // Wait for response with a 30s timeout
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Test timed out after 30 seconds")), 30000)
        );

        const result = await Promise.race([promise, timeoutPromise]);
        const durationMs = Date.now() - startTime;

        console.log("\n-------------------------------------------------------");
        console.log(`⏱️  Duration: ${durationMs}ms`);
        console.log(`📊 HTTP Status: ${result.statusCode}`);
        console.log("📦 Response Payload:\n", JSON.stringify(result.data, null, 2));
        console.log("-------------------------------------------------------");

        if (result.statusCode >= 200 && result.statusCode < 300) {
            console.log("✅ TEST PASSED: Successfully fetched contribution summary.\n");
        } else {
            console.warn(`⚠️ TEST COMPLETED WITH STATUS ${result.statusCode}.\n`);
        }

        return { ...result, durationMs };
    } catch (error) {
        const durationMs = Date.now() - startTime;
        console.error(`\n❌ TEST FAILED after ${durationMs}ms:`, error.message);
        throw error;
    }
}

// Support direct CLI execution: node test_contSummaryNew.js <PIN>
if (require.main === module) {
    const testPin = process.argv[2] || "PEN100000000001";

    if (!process.argv[2]) {
        console.log("ℹ️  No PIN provided in arguments. Defaulting to sample PIN:", testPin);
        console.log("💡 Usage: node test_contSummaryNew.js <YOUR_PIN_OR_PHONE>\n");
    }

    testContSummaryNew(testPin)
        .then(() => {
            console.log("🏁 Test execution finished.");
            process.exit(0);
        })
        .catch(() => {
            process.exit(1);
        });
}

module.exports = {
    testContSummaryNew,
    createMockReqRes
};
