// What the same kind of thing looks like coming from three different carriers.

export const swiftShipPayload = {
  tracking_no: 'SS-1001',
  state: 'IN_TRANSIT',
  price: '125.5',
  currency: 'egp',
  last_update: '2026-11-20T12:15:00+02:00',
};

export const parcelGoPayload = {
  data: {
    shipment: {
      ref: 7781,
      statusCode: 4,
      fee: { cents: 9900, cur: 'USD' },
      updated: 1795256100, // 2026-11-21T10:15:00Z
    },
  },
};

export const boxlyPayload = {
  Shipment: {
    Id: 'B-55',
    Status: 'Delivered - signed by recipient',
    Charge: { Amount: '40', Currency: 'EUR' },
    Timestamp: '20/11/2026 09:30',
  },
};

/** The carrier shipped a new status without telling anyone. */
export const swiftShipNewStatus = { ...swiftShipPayload, tracking_no: 'SS-1002', state: 'HELD_AT_CUSTOMS' };

/** A required field went missing. */
export const parcelGoBroken = { data: { shipment: { ref: 7782, statusCode: 2, updated: 1795256100 } } };
