// Supabase Edge Function: send-credit-app-notification
// Triggered by Database Webhook on public.credit_applications INSERT.
//
// TEMPLATE NOTE: configure these as Supabase function secrets before going
// live (`npx supabase secrets set NOTIFICATION_TO_EMAILS=you@example.com,...`).
// The fallbacks below are placeholders, not real addresses.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const DEFAULT_TO_EMAILS = ["admin@example.com"];
const CONFIGURED_TO_EMAILS = (Deno.env.get("NOTIFICATION_TO_EMAILS") || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);
const TO_EMAILS = CONFIGURED_TO_EMAILS.length > 0 ? CONFIGURED_TO_EMAILS : DEFAULT_TO_EMAILS;
if (CONFIGURED_TO_EMAILS.length === 0) {
  console.warn("NOTIFICATION_TO_EMAILS is not set; falling back to a placeholder recipient. Set this secret before going live.");
}
const BRAND_NAME = Deno.env.get("NOTIFICATION_BRAND_NAME") || "Your Dealership";
const FROM_EMAIL = Deno.env.get("NOTIFICATION_SENDER_EMAIL") || "website@example.com";
// Placeholder contact number shown in the customer confirmation email — replace
// with your real number (or add an env var) before going live.
const DEALERSHIP_PHONE_DISPLAY = "(555) 555-0100";
const DEALERSHIP_PHONE_TEL = "5555550100";

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
      }
    });
  }

  // Restrict to POST only
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  try {
    // Validate Webhook Secret (strictly required for fail-closed security)
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("Server misconfiguration: WEBHOOK_SECRET environment variable is not set.");
      return new Response(JSON.stringify({ error: "Server misconfiguration: Webhook secret is not configured on the server." }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    const receivedSecret = req.headers.get("x-webhook-secret");
    if (receivedSecret !== webhookSecret) {
      console.error("Unauthorized: Webhook secret mismatch.");
      return new Response(JSON.stringify({ error: "Unauthorized access: Invalid webhook secret." }), {
        status: 401,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    const payload = await req.json();
    
    // Webhook sends payload structure: { schema: 'public', table: 'credit_applications', type: 'INSERT', record: { ... } }
    const record = payload.record;
    
    if (!record) {
      return new Response(JSON.stringify({ error: "No record found in webhook payload." }), {
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    logging("Processing credit application for " + (record.full_name || "Unknown"));

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY environment variable is not configured.");
      return new Response(JSON.stringify({ error: "Email provider credentials not configured." }), {
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // Escape applicant fields to prevent HTML/email injection
    const cleanRecord = {
      financing_type: escapeHtml(record.financing_type),
      full_name: escapeHtml(record.full_name),
      phone: escapeHtml(record.phone),
      email: escapeHtml(record.email),
      street_address: escapeHtml(record.street_address),
      city: escapeHtml(record.city),
      state: escapeHtml(record.state),
      zip_code: escapeHtml(record.zip_code),
      employment_status: escapeHtml(record.employment_status),
      employer: escapeHtml(record.employer),
      target_terms: escapeHtml(record.target_terms),
      vehicle_preferences: escapeHtml(record.vehicle_preferences),
      created_at: record.created_at, // system-generated timestamp is safe
      monthly_income: record.monthly_income // numeric is safe
    };

    const vehicleInfo = record.vehicle_of_interest; // JSONB, already safe structured data

    // Build vehicle-specific card if a vehicle was selected
    let vehicleCard = '';
    if (vehicleInfo && vehicleInfo.make) {
        const vTitle = `${vehicleInfo.year || ''} ${escapeHtml(vehicleInfo.make || '')} ${escapeHtml(vehicleInfo.model || '')}${vehicleInfo.trim ? ' ' + escapeHtml(vehicleInfo.trim) : ''}`;
        const vPrice = vehicleInfo.price ? `$${Number(vehicleInfo.price).toLocaleString()}` : 'Contact Dealer';
        const vMileage = vehicleInfo.mileage ? `${Number(vehicleInfo.mileage).toLocaleString()} miles` : 'N/A';
        const vVin = vehicleInfo.vin ? escapeHtml(vehicleInfo.vin) : 'N/A';
        const vImage = vehicleInfo.image_url || '';
        
        vehicleCard = `
          <div style="margin-bottom: 20px; border: 2px solid #333; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #1a1a1a; color: white; padding: 8px 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
              🚗 Vehicle of Interest
            </div>
            ${vImage ? `<img src="${vImage}" alt="${vTitle}" style="width: 100%; max-height: 250px; object-fit: cover; display: block;">` : ''}
            <div style="padding: 15px; background-color: #f9f9f9;">
              <div style="font-size: 18px; font-weight: bold; color: #1a1a1a; margin-bottom: 4px;">${vTitle}</div>
              <div style="font-size: 22px; font-weight: bold; color: #2563eb; margin-bottom: 8px;">${vPrice}</div>
              <table style="font-size: 13px; color: #555;">
                <tr><td style="padding-right: 15px;"><strong>Mileage:</strong> ${vMileage}</td><td><strong>VIN:</strong> ${vVin}</td></tr>
              </table>
            </div>
          </div>
        `;
    }

    // Build standard detail rows for admin email
    const detailsTable = `
      <table border="1" cellpadding="8" style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 14px; width: 100%; max-width: 600px;">
        <tr style="background-color: #f2f2f2; font-weight: bold;">
          <th style="text-align: left; padding: 10px;">Field</th>
          <th style="text-align: left; padding: 10px;">Value</th>
        </tr>
        <tr>
          <td style="font-weight: bold; width: 35%;">Financing Type</td>
          <td>${cleanRecord.financing_type === "bank" ? "Bank Financing" : "Buy Here Pay Here (BHPH)"}</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Full Name</td>
          <td>${cleanRecord.full_name || "N/A"}</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Phone Number</td>
          <td>${cleanRecord.phone || "N/A"}</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Email</td>
          <td>${cleanRecord.email || "N/A"}</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Address</td>
          <td>
            ${cleanRecord.street_address || "N/A"}<br>
            ${cleanRecord.city || ""}, ${cleanRecord.state || ""} ${cleanRecord.zip_code || ""}
          </td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Employment Status</td>
          <td>${cleanRecord.employment_status || "N/A"}</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Employer</td>
          <td>${cleanRecord.employer || "N/A"}</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Monthly Income</td>
          <td>$${cleanRecord.monthly_income ? Number(cleanRecord.monthly_income).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : "N/A"}</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Target Terms</td>
          <td>${cleanRecord.target_terms || "N/A"}</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Vehicle Preferences</td>
          <td>${cleanRecord.vehicle_preferences || "N/A"}</td>
        </tr>
        <tr>
          <td style="font-weight: bold;">Submitted At</td>
          <td>${cleanRecord.created_at ? new Date(cleanRecord.created_at).toLocaleString() : "N/A"}</td>
        </tr>
      </table>
    `;

    // 1. Prepare email payload for Admin
    const adminEmailPayload = {
      from: `${BRAND_NAME} <${FROM_EMAIL}>`,
      to: TO_EMAILS,
      subject: vehicleInfo && vehicleInfo.make
          ? `[Vehicle Inquiry] ${vehicleInfo.year || ''} ${vehicleInfo.make} ${vehicleInfo.model || ''} - ${cleanRecord.full_name || "New Applicant"}`
          : `[New Lead] Credit Application - ${cleanRecord.full_name || "New Applicant"}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #2b2b2b; border-bottom: 2px solid #545454; padding-bottom: 10px;">New Credit Application Received</h2>
          <p style="font-size: 15px; line-height: 1.5; color: #555;">A user has submitted a new financing application on the ${BRAND_NAME} digital showroom platform. Review the details below:</p>
          ${vehicleCard}
          <div style="margin-top: 20px; margin-bottom: 20px;">
            ${detailsTable}
          </div>
          <p style="font-size: 13px; color: #777; font-style: italic; border-top: 1px solid #eee; padding-top: 15px; margin-top: 20px;">
            This email was automatically generated and sent from the ${BRAND_NAME} website database webhook.
          </p>
        </div>
      `
    };

    // 2. Prepare customer confirmation email payload if customer email exists
    let customerEmailPayload = null;
    if (cleanRecord.email && cleanRecord.email.trim() !== "") {
      const customerEmail = cleanRecord.email.trim();
      customerEmailPayload = {
        from: `${BRAND_NAME} <${FROM_EMAIL}>`,
        to: [customerEmail],
        subject: `We Received Your Application - ${BRAND_NAME}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px;">
            <h2 style="color: #2b2b2b; border-bottom: 2px solid #545454; padding-bottom: 10px;">Thank You for Reaching Out!</h2>
            <p style="font-size: 15px; line-height: 1.5; color: #555;">Dear ${cleanRecord.full_name || "Valued Customer"},</p>
            ${vehicleInfo && vehicleInfo.make
              ? `<p style="font-size: 15px; line-height: 1.5; color: #555;">We have received your inquiry about the <strong>${vehicleInfo.year || ''} ${escapeHtml(vehicleInfo.make)} ${escapeHtml(vehicleInfo.model || '')}${vehicleInfo.price ? ' ($' + Number(vehicleInfo.price).toLocaleString() + ')' : ''}</strong>.</p>`
              : `<p style="font-size: 15px; line-height: 1.5; color: #555;">We have successfully received your pre-qualification/financing request for: <strong>${cleanRecord.vehicle_preferences || "General Inventory"}</strong>.</p>`
            }
            <p style="font-size: 15px; line-height: 1.5; color: #555;">A sales representative will review your information and get in touch with you shortly to discuss your options.</p>
            <p style="font-size: 15px; line-height: 1.5; color: #555;">If you have any questions in the meantime, feel free to reply directly to this email or call us at <a href="tel:${DEALERSHIP_PHONE_TEL}" style="color: #007bff; text-decoration: none;">${DEALERSHIP_PHONE_DISPLAY}</a>.</p>
            <br>
            <p style="font-size: 15px; line-height: 1.5; color: #555; margin-bottom: 0;">Best regards,</p>
            <p style="font-size: 16px; font-weight: bold; color: #2b2b2b; margin-top: 5px;">${BRAND_NAME} Team</p>
            <p style="font-size: 13px; color: #777; font-style: italic; border-top: 1px solid #eee; padding-top: 15px; margin-top: 20px;">
              This is an automated confirmation of your request. Please do not reply directly if you wish to contact us immediately — call us instead!
            </p>
          </div>
        `
      };
    }

    // Send emails in isolated try-catch blocks to prevent cascading failures
    let adminSent = false;
    let adminError = null;

    try {
      logging(`Sending admin notification email to ${TO_EMAILS.join(', ')}...`);
      const adminRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${RESEND_API_KEY}`
        },
        body: JSON.stringify(adminEmailPayload)
      });
      const adminResText = await adminRes.text();
      logging(`Admin email status: ${adminRes.status}. Response: ${adminResText}`);
      
      if (adminRes.status === 200 || adminRes.status === 201) {
        adminSent = true;
      } else {
        adminError = `Resend status ${adminRes.status}: ${adminResText}`;
      }
    } catch (err) {
      console.error("Error sending admin email:", err);
      adminError = err.message || String(err);
    }

    let customerSent = false;
    let customerError = null;

    if (customerEmailPayload) {
      try {
        logging(`Sending customer confirmation email to ${cleanRecord.email}...`);
        const customerRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${RESEND_API_KEY}`
          },
          body: JSON.stringify(customerEmailPayload)
        });
        const customerResText = await customerRes.text();
        logging(`Customer email status: ${customerRes.status}. Response: ${customerResText}`);
        
        if (customerRes.status === 200 || customerRes.status === 201) {
          customerSent = true;
        } else {
          customerError = `Resend status ${customerRes.status}: ${customerResText}`;
        }
      } catch (err) {
        console.error("Error sending customer email:", err);
        customerError = err.message || String(err);
      }
    }

    // Return success to the webhook if the admin notification went through
    if (adminSent) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Notification processing completed.",
        admin_sent: true,
        customer_sent: customerSent,
        customer_error: customerError
      }), {
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } else {
      return new Response(JSON.stringify({ 
        error: "Failed to send admin notification", 
        details: adminError,
        customer_sent: customerSent,
        customer_error: customerError
      }), {
        status: 502,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

  } catch (error) {
    console.error("Internal server error inside edge function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
});

// HTML escaping helper
function escapeHtml(str: any): string {
  if (str === null || str === undefined) return "";
  const s = typeof str === "string" ? str : String(str);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function logging(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}
