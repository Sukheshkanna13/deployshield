/**
 * Email Alert Service — Sends deployment anomaly notifications via email
 *
 * Uses Nodemailer with Gmail SMTP. Requires:
 *   ALERT_EMAIL_FROM   → sender Gmail address
 *   ALERT_EMAIL_PASS   → Gmail App Password (not regular password)
 *   ALERT_EMAIL_TO     → recipient email address
 *
 * To set up Gmail App Password:
 *   1. Enable 2FA on your Google account
 *   2. Go to: https://myaccount.google.com/apppasswords
 *   3. Create an app password for "Mail"
 *   4. Paste the 16-char password as ALERT_EMAIL_PASS
 */
import nodemailer from 'nodemailer'

let transporter = null

function getTransporter() {
    if (transporter) return transporter

    const user = process.env.ALERT_EMAIL_FROM
    const pass = process.env.ALERT_EMAIL_PASS

    if (!user || !pass) {
        console.warn('[Email] ALERT_EMAIL_FROM or ALERT_EMAIL_PASS not set — email alerts disabled')
        return null
    }

    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass }
    })

    return transporter
}

/**
 * Send an alert email
 * @param {Object} alert - Alert object from AlertEngine
 * @param {string} projectName - Name of the monitored project
 */
export async function sendAlertEmail(alert, projectName = 'Unknown Project') {
    const mailer = getTransporter()
    const to = process.env.ALERT_EMAIL_TO

    if (!mailer || !to) {
        console.log('[Email] Skipping — email not configured')
        return false
    }

    const sevEmoji = { WARNING: '🟡', CRITICAL: '🟠', EMERGENCY: '🔴' }
    const sevColor = { WARNING: '#EAB308', CRITICAL: '#F97316', EMERGENCY: '#EF4444' }

    const subject = `${sevEmoji[alert.sev] || '⚠️'} DeployShield ${alert.sev}: ${projectName} — Risk Score ${alert.score}/100`

    const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0A1628; color: #CBD5E1; border-radius: 12px; overflow: hidden;">
      
      <!-- Header -->
      <div style="background: ${sevColor[alert.sev] || '#F97316'}; padding: 16px 24px;">
        <h1 style="margin: 0; color: white; font-size: 18px;">
          🛡️ DeployShield — ${alert.sev} Alert
        </h1>
      </div>
      
      <!-- Body -->
      <div style="padding: 24px;">
        
        <div style="background: #111D32; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748B; font-size: 12px;">Project</td>
              <td style="padding: 8px 0; color: #E2E8F0; font-size: 14px; font-weight: 600;">${projectName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B; font-size: 12px;">Risk Score</td>
              <td style="padding: 8px 0; color: ${sevColor[alert.sev]}; font-size: 20px; font-weight: 700;">${alert.score}/100</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B; font-size: 12px;">Primary Driver</td>
              <td style="padding: 8px 0; color: #E2E8F0; font-size: 14px;">${alert.primaryDriver} (${alert.pct > 0 ? '+' : ''}${Math.round(alert.pct)}%)</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B; font-size: 12px;">Z-Score</td>
              <td style="padding: 8px 0; color: #E2E8F0; font-size: 14px;">${(alert.z || 0).toFixed(2)} standard deviations from baseline</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B; font-size: 12px;">Deployment ID</td>
              <td style="padding: 8px 0; color: #94A3B8; font-size: 11px; font-family: monospace;">${alert.deploymentId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B; font-size: 12px;">Time</td>
              <td style="padding: 8px 0; color: #94A3B8; font-size: 12px;">${alert.isoTime}</td>
            </tr>
          </table>
        </div>

        <!-- Alert Message -->
        <div style="background: ${sevColor[alert.sev]}15; border: 1px solid ${sevColor[alert.sev]}40; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
          <p style="margin: 0; color: ${sevColor[alert.sev]}; font-size: 13px; font-weight: 500;">
            ${alert.message}
          </p>
        </div>

        <!-- Recommended Action -->
        <div style="background: #111D32; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
          <p style="margin: 0 0 4px 0; color: #64748B; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Recommended Action</p>
          <p style="margin: 0; color: #E2E8F0; font-size: 13px;">${alert.action}</p>
        </div>

        ${alert.autoAnalyze ? `
        <div style="background: #0EA5E915; border: 1px solid #0EA5E940; border-radius: 8px; padding: 12px 16px;">
          <p style="margin: 0; color: #0EA5E9; font-size: 12px;">
            🤖 Claude AI causal analysis has been auto-triggered. Check the dashboard for results.
          </p>
        </div>
        ` : ''}

      </div>
      
      <!-- Footer -->
      <div style="background: #060E1A; padding: 12px 24px; text-align: center;">
        <p style="margin: 0; color: #4A5568; font-size: 11px;">
          DeployShield AI — Real-Time Deployment Protection · AMD Instinct + ROCm
        </p>
      </div>
    </div>
    `

    try {
        await mailer.sendMail({
            from: `"DeployShield AI" <${process.env.ALERT_EMAIL_FROM}>`,
            to,
            subject,
            html
        })
        console.log(`[Email] ✓ Alert sent to ${to} — ${alert.sev} (Score: ${alert.score})`)
        return true
    } catch (err) {
        console.error(`[Email] ✗ Failed to send alert:`, err.message)
        return false
    }
}
