/**
 * @param {string} displayName - Name to display in footer/header
 * @returns {string} - HTML String
 */
const getEmailTemplate = (displayName, actionBy = 'System', planDate = '-', comment = '-', status = 'Waiting EN and QC', orderNo = '-', systemLink = 'http://localhost:9696', partNo = '-', attachedType = '-') => {
  const isComplete = status === 'Complete';
  const statusBg = isComplete ? '#28a745' : '#003366';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light dark">
      <meta name="supported-color-schemes" content="light dark">
      <title>Automated Report</title>
      <style>
        :root {
          color-scheme: light dark;
          supported-color-schemes: light dark;
        }
        /* Responsive CSS */
        @media screen and (max-width: 600px) {
          .container {
            width: 100% !important;
            border-radius: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          .header-section {
            padding: 20px !important;
          }
          .body-section {
            padding: 20px !important;
          }
          .footer-section {
            padding: 20px !important;
          }
          .info-table td {
            display: block;
            width: 100% !important;
            box-sizing: border-box;
          }
          .table-separator {
            display: none !important;
          }
          .table-label {
            padding-bottom: 2px !important;
          }
          .table-value {
            padding-top: 0 !important;
            padding-bottom: 15px !important;
          }
          .button-link {
            display: block !important;
            width: auto !important;
            box-sizing: border-box;
          }
        }
        /* Dark Mode Overrides */
        @media (prefers-color-scheme: dark) {
          .header-text {
            color: #ffffff !important;
            -webkit-text-fill-color: #ffffff !important;
          }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f7f6; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f7f6; padding: 20px 0;">
        <tr>
          <td align="center">
            <div class="container" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; line-height: 1.6; color: #333; border: 1px solid #ffffff; border-radius: 25px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05); text-align: left;">

              <div class="header-section" style="background-color: #003366; background-image: linear-gradient(to right, #ffffff 0%, #003366 85%); padding: 5px 25px;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td align="left" style="vertical-align: middle;">
                      <a href="https://www.minebea.co.th/" target="_blank" style="text-decoration: none;">
                        <img src="cid:logo" alt="Minebea Mitsumi Logo" style="display: block; height: 150px; width: auto; border: 0;">
                      </a>
                    </td>
                    <td align="right" style="vertical-align: middle; text-align: right;">
                      <h1 class="header-text" style="margin: 0; font-size: 20px; letter-spacing: 1px; color: #ffffff !important;">Cost Reduction</h1>
                      <p class="header-text" style="margin: 2px 0 0 0; opacity: 0.8; font-size: 12px; color: #ffffff !important;">Production Operations Management</p>
                    </td>
                  </tr>
                </table>
              </div>

              <div class="body-section" style="padding: 30px; background-color: #ffffff;">
                ${status === 'Waiting PC & PH & PD & Gauge & QC' ? `
                <h2 style="color: #003366; font-size: 20px; margin-top: 0;">Automated Report</h2>
                <p style="margin-top: 0;">A new work assignment has been successfully assigned to your role.</p>

                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; border-left: 4px solid #003366; margin: 25px 0;">
                  <table role="presentation" class="info-table" style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td class="table-label" style="padding: 5px 0; color: #666; width: 120px; vertical-align: top;">Status</td>
                      <td class="table-separator" style="padding: 5px 0; color: #666; width: 20px; vertical-align: top; text-align: center;">:</td>
                      <td class="table-value" style="padding: 5px 0; font-weight: bold; color: #ffffff; word-break: break-word;">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background-color: #003366; border-radius: 50px;">
                          <tr>
                            <td style="padding: 4px 14px; color: #ffffff; font-weight: bold; text-align: center; border-radius: 50px; line-height: 1.5;">
                              Waiting PC &amp; PH &amp; PD &amp; Gauge &amp; QC
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td class="table-label" style="padding: 5px 0; color: #666; width: 120px; vertical-align: top;">Assigned By</td>
                      <td class="table-separator" style="padding: 5px 0; color: #666; width: 20px; vertical-align: top; text-align: center;">:</td>
                      <td class="table-value" style="padding: 5px 0; font-weight: bold; color: #28a745; word-break: break-word;">${actionBy}</td>
                    </tr>
                    <tr>
                      <td class="table-label" style="padding: 5px 0; color: #666; width: 120px; vertical-align: top;">Assigned Date</td>
                      <td class="table-separator" style="padding: 5px 0; color: #666; width: 20px; vertical-align: top; text-align: center;">:</td>
                      <td class="table-value" style="padding: 5px 0; font-weight: bold; word-break: break-word;">${new Date().toLocaleString('en-GB')}</td>
                    </tr>
                    <tr>
                      <td class="table-label" style="padding: 5px 0; color: #666; width: 120px; vertical-align: top;">Plan Setup</td>
                      <td class="table-separator" style="padding: 5px 0; color: #666; width: 20px; vertical-align: top; text-align: center;">:</td>
                      <td class="table-value" style="padding: 5px 0; font-weight: bold; word-break: break-word;">${planDate && planDate !== '-' ? planDate.split(/[-/]/).reverse().join('/') : planDate}</td>
                    </tr>
                    <tr>
                      <td class="table-label" style="padding: 5px 0; color: #666; width: 120px; vertical-align: top;">Part No.</td>
                      <td class="table-separator" style="padding: 5px 0; color: #666; width: 20px; vertical-align: top; text-align: center;">:</td>
                      <td class="table-value" style="padding: 5px 0; font-weight: bold; color: #003366; word-break: break-word;">${partNo || '-'}</td>
                    </tr>
                    <tr>
                      <td class="table-label" style="padding: 5px 0; color: #666; width: 120px; vertical-align: top;">Attached Type</td>
                      <td class="table-separator" style="padding: 5px 0; color: #666; width: 20px; vertical-align: top; text-align: center;">:</td>
                      <td class="table-value" style="padding: 5px 0; font-weight: bold; color: #d97706; word-break: break-word;">${attachedType}</td>
                    </tr>
                    <tr>
                      <td class="table-label" style="padding: 5px 0; color: #666; width: 120px; vertical-align: top;">Comment</td>
                      <td class="table-separator" style="padding: 5px 0; color: #666; width: 20px; vertical-align: top; text-align: center;">:</td>
                      <td class="table-value" style="padding: 5px 0; font-weight: bold; word-break: break-word;">${(comment && comment !== '-') ? comment : 'No comments'}</td>
                    </tr>
                  </table>
                </div>

                <p style="margin-bottom: 30px;">Please access the plan list page to check detail and update.</p>
                
                <div style="text-align: center;">
                  <a href="${systemLink || 'http://localhost:9696'}" class="button-link" style="background-color: #003366; color: #ffffff !important; padding: 14px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                    View Task Details
                  </a>
                </div>
                ` : `
                <h2 style="color: #003366; font-size: 20px; margin-top: 0;">Automated Report</h2>
                <p style="margin-top: 0;">A new work assignment has been successfully assigned to your role.</p>

                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; border-left: 4px solid #003366; margin: 25px 0;">
                  <table role="presentation" class="info-table" style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td class="table-label" style="padding: 5px 0; color: #666; width: 120px; vertical-align: top;">Status</td>
                      <td class="table-separator" style="padding: 5px 0; color: #666; width: 20px; vertical-align: top; text-align: center;">:</td>
                      <td class="table-value" style="padding: 5px 0; font-weight: bold; color: #ffffff; word-break: break-word;">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background-color: ${statusBg}; border-radius: 50px;">
                          <tr>
                            <td style="padding: 4px 14px; color: #ffffff; font-weight: bold; text-align: center; border-radius: 50px; line-height: 1.5;">
                              ${status}
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td class="table-label" style="padding: 5px 0; color: #666; width: 120px; vertical-align: top;">Assigned By</td>
                      <td class="table-separator" style="padding: 5px 0; color: #666; width: 20px; vertical-align: top; text-align: center;">:</td>
                      <td class="table-value" style="padding: 5px 0; font-weight: bold; color: #28a745; word-break: break-word;">${actionBy}</td>
                    </tr>
                    <tr>
                      <td class="table-label" style="padding: 5px 0; color: #666; width: 120px; vertical-align: top;">Assigned Date</td>
                      <td class="table-separator" style="padding: 5px 0; color: #666; width: 20px; vertical-align: top; text-align: center;">:</td>
                      <td class="table-value" style="padding: 5px 0; font-weight: bold; word-break: break-word;">${new Date().toLocaleString('en-GB')}</td>
                    </tr>
                    <tr>
                      <td class="table-label" style="padding: 5px 0; color: #666; width: 120px; vertical-align: top;">Plan Setup</td>
                      <td class="table-separator" style="padding: 5px 0; color: #666; width: 20px; vertical-align: top; text-align: center;">:</td>
                      <td class="table-value" style="padding: 5px 0; font-weight: bold; word-break: break-word;">${planDate && planDate !== '-' ? planDate.split(/[-/]/).reverse().join('/') : planDate}</td>
                    </tr>
                    <tr>
                      <td class="table-label" style="padding: 5px 0; color: #666; width: 120px; vertical-align: top;">Part No.</td>
                      <td class="table-separator" style="padding: 5px 0; color: #666; width: 20px; vertical-align: top; text-align: center;">:</td>
                      <td class="table-value" style="padding: 5px 0; font-weight: bold; color: #003366; word-break: break-word;">${partNo || '-'}</td>
                    </tr>
                    <tr>
                      <td class="table-label" style="padding: 5px 0; color: #666; width: 120px; vertical-align: top;">Comment</td>
                      <td class="table-separator" style="padding: 5px 0; color: #666; width: 20px; vertical-align: top; text-align: center;">:</td>
                      <td class="table-value" style="padding: 5px 0; font-weight: bold; word-break: break-word;">${(comment && comment !== '-') ? comment : 'No comments'}</td>
                    </tr>
                  </table>
                </div>

                <p style="margin-bottom: 30px;">Please access the plan list page to review task details and take necessary action.</p>
                `}
                <div style="text-align: center;">
                  <a href="http://pbgm8g:9696" class="button-link" style="background-color: #003366; color: #ffffff !important; padding: 14px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                    View Task Details
                  </a>
                </div>
              </div>

              <div class="footer-section" style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee;">
                <p style="margin: 0;"><b>ReplyTo:</b> ${displayName}</p>
                <p style="margin: 8px 0 0 0;">This is an automated system notification. Please do not reply directly to this email.</p>
                <p style="margin: 15px 0 0 0; font-weight: bold; color: #aaa;">&copy; 2026 PMC MinebeaMitsumi Team</p>
              </div>

            </div>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

module.exports = { getEmailTemplate };
