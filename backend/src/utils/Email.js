//=============================================
// Create Date : 06/05/2026
// Create By   : Santi
// Create For  : Send email to user
//=============================================

const nodemailer = require('nodemailer');
const { getEmailTemplate } = require('./EmailTemplate');
const path = require('path');


//Function use for send Multiple Email in same time
async function sendMultipleEMail(options) {
  let displayName = "pmc.cost@minebea.co.th"
  let transporter;
  let mailOptions;
  let information;

  //This part use for handles connection email service message
  try {
    transporter = nodemailer.createTransport({
      service: 'gmail', //use service gmail
      auth: {
        user: process.env.EMAIL_USER, //Email from .env file
        pass: process.env.EMAIL_PASS, //Password from .env file
      },
    });
  } catch (err) { 
    console.error('Nodemailer transporter creation failed:', err.message); 
    throw new Error('Nodemailer transporter creation failed: ' + err.message); 
  }

  //Use verify status for server
  try {
    await transporter.verify();
    console.log('SMTP connection OK — server is ready to accept messages');
  } catch (err) { 
    console.error('SMTP verification failed:', err.message); 
    throw new Error('SMTP verification failed: ' + err.message); 
  }

  //Use send message
  try {
    mailOptions = {
      from: `"PMC Cost Reduction <${displayName}>" <${displayName}>`, //Display name and email
      to: options.to, //Receiver (non assign now)
      subject: (options.status === 'Waiting PC & PH & PD & Gauge & QC') ? `[Automated Report] EN Department Updated Drawing / Layout - ${options.orderNo || '-'}` : 'Automated Cost Report', //Header
      html: getEmailTemplate(displayName, options.actionBy, options.planDate, options.comment, options.status, options.orderNo, options.systemLink, options.partNo, options.attachedType), //message part
      replyTo: `${displayName}`, //Told user reply to this Email
      attachments: [{ //CID img use for send img to gmail if delete logo doesn't work
        filename: 'logominebea.png',
        path: path.join(__dirname, '../../../frontend/public/logominebea.png'),
        cid: 'logo',
        contentDisposition: 'inline'
      }]
    };
  } catch (err) { 
    console.error('MailOptions construction failed:', err.message); 
    throw new Error('MailOptions construction failed: ' + err.message); 
  }

  //Use check data mailOptions
  console.log(`From : ${mailOptions.from}`)
  console.log(`To : ${mailOptions.to}`)
  console.log(`Subject : ${mailOptions.subject}`)
  console.log(`ReplyTo : ${mailOptions.replyTo}`)

  //Use sendmail status for server
  try {
    information = await transporter.sendMail(mailOptions);
  } catch (err) { 
    console.error('transporter.sendMail failed:', err.message); 
    throw new Error('transporter.sendMail failed: ' + err.message); 
  }

  //Use check status send mail
  console.log(`Message ID : ${information.messageId}`)
  console.log(`Accepted : ${information.accepted}`)
  console.log(`Rejected : ${information.rejected}`)
  console.log(`Response : ${information.response}`)

  return information;
}

module.exports = { sendMultipleEMail };
