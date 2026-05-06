const Contact = require('../models/Contact');
const sendEmail = require('../utils/sendEmail');

// @desc    Create contact message
// @route   POST /api/contact
// @access  Public
const createContact = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and message are required'
      });
    }

    // Create contact in database
    const contact = await Contact.create({
      name,
      email,
      phone: phone || '',
      subject: subject || 'General Inquiry',
      message
    });

    // Send email notification to admin
    try {
      await sendEmail({
        email: process.env.EMAIL_ADMIN || 'samijlassi2909@gmail.com',
        subject: `New Message from ${name} - ${contact.subject}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #141010; padding: 20px; border-radius: 12px 12px 0 0;">
              <h2 style="color: #ffffff; margin: 0;">${process.env.APP_NAME || 'Tawakkul'} - New Contact</h2>
            </div>
            <div style="background: #ffffff; padding: 24px; border: 1px solid #e8e8e8; border-top: none; border-radius: 0 0 12px 12px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #888; font-weight: 600;">Name:</td>
                  <td style="padding: 8px 0; color: #141010;">${name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #888; font-weight: 600;">Email:</td>
                  <td style="padding: 8px 0; color: #141010;">${email}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #888; font-weight: 600;">Phone:</td>
                  <td style="padding: 8px 0; color: #141010;">${phone || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #888; font-weight: 600;">Subject:</td>
                  <td style="padding: 8px 0; color: #141010;">${subject || 'General Inquiry'}</td>
                </tr>
              </table>
              <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e8e8e8;">
                <p style="color: #888; font-weight: 600; margin-bottom: 8px;">Message:</p>
                <p style="color: #141010; line-height: 1.6;">${message}</p>
              </div>
              <p style="color: #aaa; font-size: 12px; margin-top: 20px;">
                Received on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
              </p>
            </div>
          </div>
        `
      });
    } catch (emailErr) {
      console.error('Admin notification email failed:', emailErr.message);
      // Don't fail the request if email fails
    }

    // Send auto-reply to customer
    try {
      await sendEmail({
        email: email,
        subject: `Thank you for contacting ${process.env.APP_NAME || 'Tawakkul'}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; padding: 30px 20px;">
              <h1 style="color: #141010; margin: 0;">${process.env.APP_NAME || 'TAWAKKUL'}</h1>
              <div style="background: #c31919; height: 3px; width: 50px; margin: 15px auto;"></div>
            </div>
            <div style="background: #fafafa; padding: 24px; border-radius: 12px;">
              <h2 style="color: #141010; margin-top: 0;">Hello ${name},</h2>
              <p style="color: #444; line-height: 1.6;">Thank you for reaching out! We've received your message and our team will get back to you within 24 hours.</p>
              <div style="background: #ffffff; padding: 16px; border-left: 4px solid #c31919; margin: 16px 0; border-radius: 0 8px 8px 0;">
                <p style="color: #888; margin: 0; font-size: 14px;">Your message:</p>
                <p style="color: #141010; margin: 8px 0 0 0; font-style: italic;">"${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"</p>
              </div>
              <p style="color: #888; font-size: 14px;">For urgent inquiries, call us at +216 12 345 678</p>
              <a href="${process.env.APP_URL || 'https://www.tawakkol.tn'}" style="display: inline-block; background: #141010; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 30px; margin-top: 12px;">Visit Our Store</a>
            </div>
          </div>
        `
      });
    } catch (emailErr) {
      console.error('Auto-reply email failed:', emailErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully! We\'ll get back to you soon.',
      data: {
        id: contact._id,
        name: contact.name,
        email: contact.email,
        subject: contact.subject,
        createdAt: contact.createdAt
      }
    });

  } catch (error) {
    console.error('Create Contact Error:', error);
    
    // MongoDB validation error
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0]
      });
    }

    res.status(500).json({
      success: false,
      message: 'Unable to send message. Please try again later.'
    });
  }
};

// @desc    Get all contacts (Admin only)
// @route   GET /api/contact
// @access  Private/Admin
const getContacts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    const query = {};
    if (status && ['unread', 'read', 'replied'].includes(status)) {
      query.status = status;
    }

    const contacts = await Contact.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Contact.countDocuments(query);

    res.status(200).json({
      success: true,
      count: contacts.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: contacts
    });

  } catch (error) {
    console.error('Get Contacts Error:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to fetch contacts'
    });
  }
};

// @desc    Update contact status (Admin only)
// @route   PATCH /api/contact/:id
// @access  Private/Admin
const updateContactStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!status || !['unread', 'read', 'replied'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be: unread, read, or replied'
      });
    }

    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    res.status(200).json({
      success: true,
      message: `Contact marked as ${status}`,
      data: contact
    });

  } catch (error) {
    console.error('Update Contact Error:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to update contact'
    });
  }
};

// @desc    Delete contact (Admin only)
// @route   DELETE /api/contact/:id
// @access  Private/Admin
const deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Contact deleted successfully'
    });

  } catch (error) {
    console.error('Delete Contact Error:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to delete contact'
    });
  }
};

module.exports = {
  createContact,
  getContacts,
  updateContactStatus,
  deleteContact
};