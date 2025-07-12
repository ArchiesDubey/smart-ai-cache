import * as crypto from 'crypto-js';
function sortObject(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(sortObject);
    }
    const sortedKeys = Object.keys(obj).sort();
    const sortedObj = {};
    for (const key of sortedKeys) {
        sortedObj[key] = sortObject(obj[key]);
    }
    return sortedObj;
}
export function generateHashedKeyForPayload(payload) {
    const normalizedPayload = sortObject(payload);
    const payloadString = JSON.stringify(normalizedPayload);
    return crypto.MD5(payloadString).toString();
}
