# Supabase Edge Functions & Webhooks

This directory contains database configurations and serverless Edge Functions for this dealership platform.

---

## 📧 Credit Application Email Notifications

The `send-credit-app-notification` Edge Function automatically sends a formatted HTML email containing application details to the dealership administration when a new row is inserted into the `credit_applications` table.

### Step 1: Deploy the Edge Function

To deploy the function to your remote Supabase project:
1. Open Command Prompt/Terminal on your machine and navigate to the project root directory.
2. Log in to your Supabase account:
   ```bash
   npx supabase login
   ```
3. Link your local project directory to your remote Supabase project (find your
   project ref in the Supabase dashboard URL or `Settings > General`):
   ```bash
   npx supabase link --project-ref your-project-ref
   ```
4. Deploy the function:
   ```bash
   npx supabase functions deploy send-credit-app-notification
   ```

### Step 2: Configure Environment Variables (Secrets)

The Edge Function needs your Resend API credentials to send emails. Configure these secrets in Supabase:
1. Set your **Resend API Key**:
   ```bash
   npx supabase secrets set RESEND_API_KEY=re_your_secret_resend_api_key
   ```
2. Set the recipient(s), sender, and display name:
   ```bash
   npx supabase secrets set NOTIFICATION_TO_EMAILS=admin@example.com,sales@example.com
   npx supabase secrets set NOTIFICATION_SENDER_EMAIL=website@example.com
   npx supabase secrets set NOTIFICATION_BRAND_NAME="Your Dealership"
   ```
   *Note: Resend requires you to verify ownership of your sending domain before you can send emails from it. If you have not verified a domain yet, you can test using Resend's free sandbox sender address (e.g., `onboarding@resend.dev`) and send to your registered developer email.*

### Step 3: Enable the Database Webhook

To connect the database table inserts to our Edge Function:
1. Go to the [Supabase Dashboard](https://supabase.com/dashboard) and open your project.
2. In the left navigation bar, go to **Integrations** > **Webhooks** (or **Database** > **Webhooks**).
3. If webhooks are not yet enabled, click **Enable Webhooks**.
4. Click **Create Webhook** and fill out the details:
   * **Name**: `send-credit-app-notification`
   * **Table**: Choose `public` and `credit_applications`
   * **Events**: Check **Insert** only (so it triggers when a new application is submitted)
   * **Type of Webhook**: Select **Supabase Edge Function**
   * **Method**: `POST`
   * **Edge Function**: Select `send-credit-app-notification` from the list.
5. Click **Create Webhook**.

Now, whenever a user submits the credit application form on the website, Supabase will instantly run this Edge Function and send a lead notification email.
