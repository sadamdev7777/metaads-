-- Wording shown on the Integrations tab for connections that are not set up yet.
update public.integration_status set detail = 'Not connected yet. Create a key, then have the website send each lead to the webhook.' where key = 'website_form' and status = 'not_set_up';
update public.integration_status set detail = 'Not connected yet. Messages start in Phase 4, the connection can be set up now.' where key = 'whatsapp' and status = 'not_set_up';
update public.integration_status set detail = 'Not connected yet. Sending deposits back starts in Phase 4, the connection can be set up now.' where key = 'meta_capi' and status = 'not_set_up';
update public.integration_status set detail = 'Not connected yet. Sending email starts later, the connection can be set up now.' where key = 'mailgun' and status = 'not_set_up';
update public.integration_status set detail = 'On hold for now.' where key = 'travelcrm' and status = 'not_set_up';
update public.integration_status set detail = 'Not connected yet. Paste a system user token below.' where key = 'meta_ads' and status = 'not_set_up';
