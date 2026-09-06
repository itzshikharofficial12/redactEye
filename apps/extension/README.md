# RedactEye Browser Extension (`apps/extension`)

This application directory houses the browser extension shell for Chromium (Chrome, Edge, Brave) and Firefox.

## Ownership
- **Primary Owner:** Person 1 — Browser / Extension

## Eventual Responsibilities
- Manifest V3 architecture and configuration for Chrome and Firefox
- Extension lifecycle management and permissions configuration
- Background service worker for coordination and communication
- Content scripts for active page interaction, DOM observation, and event handling
- Extension popup UI, configuration settings, and redaction preview displays
- Local browser action executor for safely dispatching actions (click, scroll, type, select, navigate)
- Screen capture orchestration using browser capture APIs
