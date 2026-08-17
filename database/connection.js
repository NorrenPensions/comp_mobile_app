const Sentry = require('@sentry/node');
const sql = require('mssql');
const axios = require('axios');

// Direct MSSQL settings (for local development or direct LAN access)
const dbsetttings = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    options: {
        trustedconnection: true,
        useUTC: false,
        enableArithAbort: true,
        encrypt: process.env.DB_ENCRYPT === 'true',
        instancename: process.env.DB_INSTANCE_NAME || ""
    },
    port: parseInt(process.env.DB_PORT || '1433', 10)
};

// Helper to parse MSSQL data types passed to input(...)
function extractSqlTypeInfo(typeObj) {
    if (!typeObj) return { type: null, length: null };
    if (typeof typeObj === 'string') return { type: typeObj, length: null };
    
    let typeName = typeObj.name || (typeObj.type && (typeObj.type.name || typeObj.type.toString()));
    let length = typeObj.length || typeObj.precision || null;

    if (!typeName && typeof typeObj === 'function') {
        typeName = typeObj.name;
    }

    return { type: typeName || null, length };
}

// HTTP Proxy Request for On-Prem Gateway
class GatewayProxyRequest {
    constructor(gatewayUrl, apiKey) {
        this.gatewayUrl = gatewayUrl;
        this.apiKey = apiKey;
        this.inputs = [];
    }

    input(name, typeOrValue, value) {
        if (value !== undefined) {
            // Type specified: e.g. input('pin', sql.VarChar(100), pin)
            const { type, length } = extractSqlTypeInfo(typeOrValue);
            this.inputs.push({ name, type, length, value });
        } else {
            // Value only: e.g. input('pin', pin)
            this.inputs.push({ name, value: typeOrValue });
        }
        return this;
    }

    async query(queryString) {
        try {
            const response = await axios.post(
                `${this.gatewayUrl.replace(/\/$/, '')}/api/v1/db/query`,
                {
                    query: queryString,
                    inputs: this.inputs
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': this.apiKey
                    },
                    timeout: 35000
                }
            );

            if (response.data && response.data.success) {
                return {
                    recordset: response.data.recordset,
                    recordsets: response.data.recordsets,
                    rowsAffected: response.data.rowsAffected
                };
            } else {
                throw new Error(response.data?.error || 'Unknown gateway query execution error');
            }
        } catch (error) {
            console.error('❌ Gateway Proxy Query Error:', error.response?.data || error.message);
            if (Sentry && typeof Sentry.captureException === 'function') {
                Sentry.captureException(error);
            }
            throw error;
        }
    }
}

// HTTP Proxy Pool for On-Prem Gateway
class GatewayProxyPool {
    constructor(gatewayUrl, apiKey) {
        this.gatewayUrl = gatewayUrl;
        this.apiKey = apiKey;
        this.connected = true;
    }

    request() {
        return new GatewayProxyRequest(this.gatewayUrl, this.apiKey);
    }
}

async function getConnection() {
    const gatewayUrl = process.env.ONPREM_GATEWAY_URL;
    const apiKey = process.env.ONPREM_GATEWAY_API_KEY;

    if (gatewayUrl && apiKey) {
        // Mode 1: HTTP Gateway Proxy Mode (e.g. deployed on Render)
        return new GatewayProxyPool(gatewayUrl, apiKey);
    }

    // Mode 2: Direct Database Connection Mode (e.g. running locally / on-prem)
    try {
        const pool = await sql.connect(dbsetttings);
        return pool;
    } catch (error) {
        console.error('❌ Direct SQL Connection Error:', error);
        if (Sentry && typeof Sentry.captureException === 'function') {
            Sentry.captureException(error);
        }
    }
}

module.exports = { getConnection };