import {createHash} from 'node:crypto';
/** JSONB reorders object keys; hash the explicit content tuple, never insertion order. */
export function campaignSnapshotHash(copy:{subject:string;body:string;html:string|null}) {
 return createHash('sha256').update(JSON.stringify([copy.subject,copy.body,copy.html])).digest('hex');
}