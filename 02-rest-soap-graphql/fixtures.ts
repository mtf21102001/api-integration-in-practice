// Realistic responses you'll meet in the wild. All made up, all very familiar.

export const rest = {
  ok: { status: 200, body: { data: { id: 'C-42', name: 'Acme' } } },
  notFound: { status: 404, body: { error: 'customer not found' } },
  okButFailed: { status: 200, body: { success: false, code: 'INSUFFICIENT_BALANCE', message: 'Not enough balance' } },
  serverError: { status: 503, body: { message: 'Service Unavailable' } },
};

export const soap = {
  ok: {
    status: 200,
    xml: `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body><GetBalanceResponse><Balance>120.50</Balance></GetBalanceResponse></soap:Body>
</soap:Envelope>`,
  },
  clientFault: {
    status: 500,
    xml: `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body><soap:Fault>
    <faultcode>soap:Client</faultcode>
    <faultstring>Invalid account number</faultstring>
  </soap:Fault></soap:Body>
</soap:Envelope>`,
  },
  serverFault12: {
    status: 500,
    xml: `<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope">
  <env:Body><env:Fault>
    <env:Code><env:Value>env:Receiver</env:Value></env:Code>
    <env:Reason><env:Text xml:lang="en">Backend timeout</env:Text></env:Reason>
  </env:Fault></env:Body>
</env:Envelope>`,
  },
};

export const graphql = {
  ok: { status: 200, body: { data: { customer: { id: 'C-42', name: 'Acme' } } } },
  errorWith200: {
    status: 200,
    body: { data: { customer: null }, errors: [{ message: 'Not authorized', path: ['customer'], extensions: { code: 'FORBIDDEN' } }] },
  },
  partial: {
    status: 200,
    body: {
      data: { customer: { id: 'C-42', name: 'Acme', invoices: null } },
      errors: [{ message: 'Invoices service timed out', path: ['customer', 'invoices'] }],
    },
  },
};
