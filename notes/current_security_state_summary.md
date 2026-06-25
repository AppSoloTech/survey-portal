# Survey Portal Security Review Summary

## Executive Summary

The Survey Portal has completed a practical security hardening pass across the application, Azure App Service, and Azure PostgreSQL database. The work focused on reducing common web-app risks, tightening production configuration, improving abuse resistance, and narrowing database network access without introducing unnecessary paid Azure services.

The current state is appropriate for a controlled pilot or early public rollout. The application now has stronger cookie security, CSRF protection, origin validation, browser security headers, PostgreSQL-backed rate limiting, server-side session invalidation, and a tighter database firewall allow-list.

Several additional controls were reviewed but intentionally deferred because they either require client approval for possible Azure costs, require higher Azure permissions, or represent larger architecture changes that should be scheduled separately.

## What We Did And How It Helps

### Application Authentication And Session Security

- Kept authentication in `HttpOnly` cookies instead of browser-stored bearer tokens.
- Ensured production auth cookies are `Secure` and `SameSite=Lax`.
- Added CSRF token validation for authenticated unsafe browser requests.
- Added explicit `Origin` / `Referer` validation for unsafe browser requests.
- Added server-side session invalidation using a user `session_version` embedded in JWTs.
- Invalidated existing sessions after password resets and admin role changes.
- Kept anonymous public survey routes separate from authenticated app behavior.

How this helps:

- Reduces risk from token theft through browser JavaScript.
- Reduces cross-site request forgery risk.
- Prevents stale sessions from remaining valid after sensitive account changes.
- Keeps public anonymous survey flows isolated from account-authenticated flows.

### Browser And HTTP Security Headers

The production app now emits hardened browser security headers:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Content-Security-Policy` with `script-src 'self'`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Cross-Origin-Opener-Policy: same-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

How this helps:

- Enforces HTTPS behavior in browsers.
- Reduces cross-site scripting blast radius.
- Prevents clickjacking.
- Blocks MIME-sniffing behavior.
- Reduces referrer leakage.
- Disables unused browser features such as camera, microphone, and geolocation.

### Application-Side Rate Limiting

The app now uses `express-rate-limit` with a custom PostgreSQL-backed rate-limit store. Rate-limit counters are persisted in PostgreSQL, keyed by scope plus hashed identifiers, and expired windows are pruned automatically.

Current limits:

- Login: 5 attempts per 15 minutes by IP.
- Login: 5 failed attempts per 15 minutes by email.
- Registration: 5 attempts per 15 minutes by IP.
- Registration: 5 attempts per 15 minutes by email.
- Password reset request: 5 requests per 15 minutes by IP.
- Password reset request: 5 requests per 15 minutes by email.
- Password reset completion: 5 attempts per 15 minutes by IP.
- Anonymous survey public access: 120 requests per 15 minutes.
- Anonymous survey conversion registration: 5 attempts per 15 minutes.

How this helps:

- Reduces credential guessing.
- Reduces registration spam.
- Reduces password-reset abuse.
- Reduces public anonymous survey request floods.
- Keeps rate-limit state outside process memory, which is safer across restarts and better positioned for future scaling.

### Request Logging And Sensitive Data Redaction

- Expanded request-log redaction for tokens, secrets, passwords, reset links, anonymous survey tokens, attempt tokens, and email-adjacent sensitive values.
- API request logging masks anonymous survey URL tokens.

How this helps:

- Reduces the chance that sensitive values are exposed in operational logs.
- Makes logs safer to review during troubleshooting.

### Azure App Service Hardening

Current Azure App Service security posture:

- HTTPS-only enabled.
- Minimum TLS version set to `1.2` for the app.
- Minimum TLS version set to `1.2` for the SCM/Kudu site.
- FTPS disabled.
- Always On enabled.
- Health check path set to `/api/health/ready`.
- Production environment uses `RUN_ENV=prod` and `NODE_ENV=production`.
- `TRUST_PROXY_HOPS=1` is configured for Azure App Service proxy behavior.
- `WEB_ORIGIN` is configured to the production Web App origin.
- Production secrets are set in Azure App Service configuration.

How this helps:

- Enforces encrypted client traffic.
- Removes an unnecessary file-transfer access path.
- Improves app availability and warm-start behavior.
- Gives Azure a readiness endpoint that verifies database connectivity.
- Ensures production security behavior is actually running in production mode.

### Azure PostgreSQL Firewall Hardening

Current Azure PostgreSQL posture:

- TLS is required via `require_secure_transport=on`.
- PostgreSQL SSL is enabled with minimum TLS set to `TLSv1.2`.
- App-side PostgreSQL certificate verification remains enabled.
- Data at rest uses Azure system-managed encryption.
- Automated backups are enabled with 7 days of point-in-time restore retention.
- Public network access is enabled, but now restricted by explicit firewall allow-list.

Completed firewall update:

- Added 31 firewall rules for the full `possibleOutboundIpAddresses` set from production App Service `njsda-wa`.
- Removed the broad Azure-services firewall setting: `Allow public access from any Azure service within Azure to this server`.
- Verified the broad `0.0.0.0` Azure-services rule is no longer present.
- Verified all 31 `njsda-wa-outbound-*` rules remain present.
- Verified production readiness after the change with `/api/health/ready`, returning `status: ok` and `database: connected`.
- Retained two known direct-access firewall rules for developer/client home-network DB administration through tools such as DBeaver:
  - `76.36.52.139`
  - `174.57.47.41`

How this helps:

- The database no longer allows broad access from any Azure-hosted service.
- Production app access remains available through the specific App Service outbound IP allow-list.
- Known administrative access remains available for approved home-network maintenance workflows.

Firewall maintenance note:

- If the App Service plan, tier, or hosting configuration changes, re-check `njsda-wa` outbound IP addresses and `possibleOutboundIpAddresses`.
- If production database connectivity breaks during or immediately after an App Service plan/tier change, the broad PostgreSQL setting `Allow public access from any Azure service within Azure to this server` can be temporarily re-enabled as a recovery bridge.
- That broad setting should only be used temporarily while the new App Service outbound IPs are identified and added to the PostgreSQL firewall allow-list.
- After the new outbound IP rules are added and `/api/health/ready` confirms `database: connected`, turn the broad Azure-services setting back off.
- Periodically review the two retained home-network DB firewall rules and remove them if direct DBeaver/admin access is no longer needed.

## What We Did Not Do And Why

### Log Analytics And Application Insights

Log Analytics was reviewed and briefly configured, then intentionally removed before production use.

What happened:

- Created a Log Analytics workspace named `njsda-law`.
- Connected Web App diagnostics to that workspace.
- Reviewed cost implications.
- Detached the Web App diagnostic setting.
- Deleted the `njsda-law` workspace.
- Verified the workspace and diagnostic attachment were removed.

Why it was not kept:

- Log Analytics is useful, but it is a potentially cost-accruing Azure Monitor service.
- The client should explicitly approve monitoring spend and ownership before enabling it.

### Azure Monitor Alerts

Azure Monitor alerting was reviewed but not implemented.

Why it was not completed:

- The current Azure account did not have permission to create Action Groups or Alert Rules.
- This should be completed by an Azure subscription or resource group administrator.

Recommended future alerts:

- Web App server errors / HTTP 5xx.
- Web App response-time degradation.
- PostgreSQL availability.
- PostgreSQL storage usage.
- PostgreSQL CPU/memory pressure.

### Azure Front Door WAF Or Application Gateway WAF

A WAF layer was reviewed but not enabled.

Why it was deferred:

- It introduces a new paid Azure service.
- It requires DNS/routing changes.
- It needs testing for auth cookies, CSRF, redirects, health checks, and origin headers.
- Current application-side rate limiting is a reasonable baseline for the current rollout stage.

### Paid Azure DDoS Protection

Paid Azure DDoS Protection was reviewed but not enabled.

Why it was deferred:

- Azure DDoS Protection mainly addresses Layer 3 and Layer 4 network attacks.
- The more likely risks for this app are Layer 7/application-layer issues such as login abuse, registration spam, password-reset abuse, and bot traffic.
- Layer 7 protection would require a WAF layer such as Azure Front Door WAF or Application Gateway WAF.

### Private Database Networking

Private endpoint / VNet integration was not implemented.

Why it was deferred:

- It is a larger architecture change.
- It may introduce networking cost and operational complexity.
- The database firewall was tightened as a practical near-term improvement.

### PostgreSQL Audit Logs To Log Analytics

PostgreSQL audit logging to Log Analytics was not enabled.

Why it was deferred:

- Log Analytics was intentionally removed to avoid unapproved monitoring costs.
- Enabling verbose audit logging without an approved monitoring destination is not useful operationally.

## Cost-Related Items Requiring Client Approval

### Log Analytics

Potential value:

- Centralized log search.
- Operational troubleshooting.
- Queryable HTTP, app, platform, and database logs.
- Optional dashboards/workbooks.

Cost considerations:

- Log Analytics billing is primarily driven by data ingestion, retention, and export.
- Microsoft currently states that the first 5 GB/month per billing account in the pay-as-you-go Analytics Logs tier is free.
- Current Microsoft Retail Prices API results for Canada Central showed Analytics Logs ingestion at approximately `$2.76/GB` after the free allowance.
- Analytics Logs include 31 days of retention.
- Current Microsoft Retail Prices API results showed Analytics Logs retention at approximately `$0.12/GB/month` for retention beyond the included period.

Current decision:

- Not enabled.
- Should be re-enabled only after the client approves monitoring cost ownership.

### Azure Front Door WAF

Potential value:

- Edge routing in front of App Service.
- Managed WAF rules.
- Custom WAF rules.
- IP/path-based rate limiting.
- Bot filtering.
- Stronger Layer 7 application-protection posture.

Implementation would require:

- Creating an Azure Front Door profile.
- Configuring App Service as the origin.
- Moving public DNS to Front Door.
- Creating a WAF policy.
- Adding managed rules and custom rate-limit rules.
- Testing authentication, CSRF, redirects, health checks, and origin behavior through the edge layer.

Cost considerations:

- Current Microsoft Retail Prices API results showed Azure Front Door Premium Zone 1 base fees at approximately `$330/month`.
- Request processing, data transfer, and optional features add usage-based costs.
- Current API results showed one Premium request meter at approximately `$0.015 per 10,000 requests`.
- Microsoft states WAF pricing is included with Azure Front Door Premium.

Current decision:

- Deferred until traffic, budget, compliance, or risk profile justifies it.

### Application Gateway WAF

Potential value:

- Regional Layer 7 load balancing.
- WAF managed rules.
- Custom WAF rules.
- TLS termination.
- VNet-based architecture options.

Cost considerations in Canada Central:

- Current Microsoft Retail Prices API results showed Application Gateway WAF v2 fixed cost at approximately `$0.432/hour`, or roughly `$315/month` before capacity and data charges.
- Capacity units add cost; current API results showed approximately `$0.0144 per capacity unit-hour`.
- Data transfer and processing can also apply.

Current decision:

- Deferred.
- Azure Front Door WAF is the cleaner future option for the current App Service architecture.

### Paid Azure DDoS Protection

Potential value:

- Stronger Layer 3/4 DDoS protection for Azure network resources.

Cost/fit considerations:

- Dedicated DDoS protection is a paid Azure security service.
- It is less directly aligned with the app’s most likely abuse patterns than a WAF.
- For web application attacks, Microsoft recommends a WAF layer for Layer 7 protection.

Current decision:

- Deferred.

### Database Backup Retention, Geo-Redundant Backup, And Storage Auto-Grow

Potential value:

- Longer point-in-time restore window.
- Better regional recovery posture if geo-redundant backup is enabled.
- Lower outage risk if storage fills up and auto-grow is enabled.

Cost considerations:

- Backup retention beyond included backup storage can incur cost.
- Geo-redundant backup can increase cost.
- Storage auto-grow can increase storage spend if the database grows.

Current decision:

- Keep current 7-day backup retention for now.
- Revisit with the client when deciding recovery objectives and budget.

## Items Requiring Additional Azure Permissions

### PostgreSQL Delete Lock

Recommended item:

- Add a delete lock to the production PostgreSQL flexible server to prevent accidental deletion.

Status:

- Attempted lock creation was blocked because the current Azure account does not have `Microsoft.Authorization/locks/write` permission.
- This should be completed by an Azure subscription or resource group administrator.

Recommended lock details:

- Resource: `njsda-db`
- Resource group: `njsda1`
- Lock name: `njsda-db-delete-lock`
- Lock type: `CanNotDelete` / portal label `Delete`
- Notes: `Prevent accidental deletion of production PostgreSQL flexible server`

Portal steps:

1. Azure Portal -> Resource groups -> `njsda1`
2. Open `njsda-db`
3. Left menu -> `Locks`
4. Select `Add`
5. Enter `njsda-db-delete-lock`
6. Set lock type to `Delete`
7. Save

### Azure Monitor Action Group And Alert Rules

Recommended item:

- Create an Action Group for production notifications.
- Add starter alert rules for App Service and PostgreSQL.

Status:

- Reviewed but not implemented because the current Azure account lacks permission to create the required alerting resources.

Recommended follow-up:

- Action Group name: `njsda-alerts-ag`
- Initial Web App alert: server errors / HTTP 5xx.
- Initial PostgreSQL alerts: availability and storage usage.

## Current Production Security Posture

Application:

- Cookie/JWT auth remains in place.
- CSRF and origin validation are active.
- Secure browser headers are active.
- PostgreSQL-backed rate limiting is active.
- Request-log redaction is expanded.
- Session invalidation is active.

Azure App Service:

- HTTPS-only enabled.
- TLS minimum set to 1.2.
- FTPS disabled.
- Always On enabled.
- Health check configured and passing.

Azure PostgreSQL:

- TLS required.
- Certificate verification remains enabled in app config.
- Database firewall is now allow-list based.
- Broad Azure-services access has been removed.
- Two known direct-access home-network IP rules remain intentionally.
- Automated backups are enabled with 7-day point-in-time restore retention.

## Recommended Next Steps

1. Have an Azure administrator add the `CanNotDelete` lock to `njsda-db`.
2. Have an Azure administrator create a basic Action Group and starter alert rules.
3. Keep Log Analytics disabled until the client approves monitoring cost ownership.
4. Revisit Log Analytics/Application Insights after the client chooses an operational monitoring budget.
5. Revisit WAF if public traffic, abuse attempts, compliance requirements, or client risk tolerance increase.
6. Revisit backup retention, geo-redundant backup, and storage auto-grow when the client defines recovery objectives.
7. Re-check App Service outbound IPs after any App Service plan/tier change; temporarily re-enable broad Azure-services DB access only as a short recovery bridge while updating the narrow firewall allow-list.
8. Periodically review the two retained home-network database firewall rules and remove them if direct DBeaver/admin access is no longer needed.

## References

- Azure Monitor pricing: https://azure.microsoft.com/en-us/pricing/details/monitor/
- Azure Monitor Logs cost guidance: https://learn.microsoft.com/en-us/azure/azure-monitor/logs/cost-logs
- Azure DDoS Protection overview: https://learn.microsoft.com/en-us/azure/ddos-protection/ddos-protection-overview
- Azure DDoS Protection pricing: https://azure.microsoft.com/en-us/pricing/details/ddos-protection/
- Azure Front Door WAF rate limiting: https://learn.microsoft.com/en-us/azure/web-application-firewall/afds/waf-front-door-rate-limit
- Azure Front Door pricing: https://azure.microsoft.com/en-us/pricing/details/frontdoor/
- Azure Web Application Firewall pricing: https://azure.microsoft.com/en-us/pricing/details/web-application-firewall/
- Application Gateway pricing: https://azure.microsoft.com/en-us/pricing/details/application-gateway/
