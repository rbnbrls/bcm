# Workflow security and privacy hardening

Dit document beschrijft de security- en privacyhardening voor Workflow Studio
en Workflow Runtime.

## Threat model

De primaire P0-risico's zijn:

- ongeautoriseerde toegang tot Studio, taken of runtime-details;
- cross-site scripting in builder-, runtime- of auditweergaven;
- clickjacking of misbruik van browsercapabilities;
- brute-force of geautomatiseerd misbruik van runtime/start/write-routes;
- uitlekken van workflowinput, snapshots, secrets of actor-ID's via auditexport;
- malware of ongeautoriseerde downloads in evidence attachments;
- kwetsbare dependencies met high/critical advisories.

De bestaande route- en servicegrenzen blijven leidend: identity komt uit de
server-side session, route-permissies staan in `route-access`, data- en
clientscope worden in service/readers opnieuw gecontroleerd.

## HTTP-boundary

`proxy.ts` past voor admin-, Workflow Studio-, Workflow Runtime- en taskroutes
altijd de securityheaders uit `security-hardening.ts` toe:

- `Content-Security-Policy`;
- `X-Frame-Options: DENY`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy`;
- cross-origin opener/resource policies.

Dezelfde proxy voert een routegevoelige in-memory rate limit uit op basis van
signed session, user of IP-fallback. Overschrijdingen krijgen `429` met
`Retry-After` en `X-RateLimit-*` headers.

## Privacy en SIEM

`workflowSecuritySiemEvent` exporteert runtime-events als SIEM-ready records met
alleen:

- eventtype en tijdstip;
- gepseudonimiseerde instance-, node- en actorreferenties;
- correlation ID;
- classificatie;
- gesorteerde payload keys.

Payloadwaarden, workflowinput, snapshots, secrets, actor-ID's en session-ID's
worden niet geexporteerd. Voor evidence blijven de bestaande regels gelden:
metadata-only opslag, malware scanstatus, tijdelijke downloadlinks en retentie.

## Dependency scanning

De 4.12-remediatie heeft `npm audit --audit-level=high` naar nul
kwetsbaarheden gebracht. Daarvoor zijn de volgende dependency-upgrades
vastgelegd:

- `next` naar `^16.3.0`;
- `nodemailer` naar `^9.0.5`;
- transitive fixes voor onder meer `sharp`, `postcss`, `brace-expansion`,
  `fast-uri`, `js-yaml`, `nanoid`, `dompurify` en `mermaid`.

De productiebuild is na de upgrades opnieuw uitgevoerd en geslaagd.

## Open aandachtspunten

Er staan geen bekende high/critical dependencybevindingen open na de scan. De
volgende niet-code controls blijven operationele releasechecks voor G4:

- onafhankelijke pentest op de productieomgeving;
- secret-rotatieprocedure in de deploymentomgeving;
- container/image scanning in CI/CD;
- SIEM-forwarderconfiguratie buiten de applicatie.
