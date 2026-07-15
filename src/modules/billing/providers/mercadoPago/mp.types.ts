// Minimal shapes of the Mercado Pago REST responses we actually read. Not an
// exhaustive mirror of the API — only the fields the provider maps into the
// gateway-agnostic types. `raw` on the gateway result keeps the full payload
// for audit, so nothing here needs to be complete.

export interface MpPreapproval {
  id:                string
  status:            string // "pending" | "authorized" | "paused" | "cancelled"
  init_point?:       string
  next_payment_date?: string
  external_reference?: string
  reason?:           string
}

export interface MpPayment {
  id:                 number | string
  status:             string // "approved" | "pending" | "rejected" | "refunded" | "charged_back" | "cancelled"
  transaction_amount: number
  currency_id:        string
  date_approved?:     string | null
  external_reference?: string
  // Present for approved payments — the payer's receipt.
  transaction_details?: { external_resource_url?: string | null }
}

// Body Mercado Pago POSTs to the webhook. `type`/`topic` + `data.id` vary by
// notification channel (Webhooks v2 uses `type`, IPN uses `topic`).
export interface MpWebhookBody {
  id?:      number | string
  type?:    string   // "payment" | "subscription_preapproval" | ...
  topic?:   string   // legacy IPN
  action?:  string   // "payment.created" | "payment.updated" | ...
  data?:    { id?: string | number }
}
