# Workflow Runtime evidence

Phase 4 adds task and instance evidence threads. The runtime stores comments
and attachment metadata, but never stores file bytes in the workflow database.

## Threads

Evidence belongs to either an instance thread or a task thread:

- instance thread: `instanceId`;
- task thread: `instanceId` plus `taskId`.

Every record carries actor, timestamp, correlation id and data classification.
Thread access is checked against the caller's workflow permission, scope and
permitted identity groups.

## Attachments

Attachment metadata contains:

- file name, content type and byte size;
- classification;
- object storage key;
- SHA-256 checksum;
- malware scan status;
- retention deadline.

The object key is created by the object-store adapter. The metadata service has
no field for file bytes or inline file content. Upload and malware scanning are
therefore external object-store concerns; workflow metadata records only the
scan result.

## Download Links

Downloads are denied until the attachment scan status is `clean`. Quarantined,
pending or deleted attachments do not receive links. Clean attachments still
require the same thread authorization and must be inside retention.

The service returns only temporary download grants with object key, URL and
expiry timestamp. URLs are produced by the object-store adapter and can be
implemented with signed object-storage links.
