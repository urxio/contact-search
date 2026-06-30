export interface BaseContact {
  firstName: string
  lastName: string
  fullName: string
  address: string
  city: string
  zipcode: string
  phone: string
}

export interface EnhancedContact extends BaseContact {
  id: string
  status: "Not checked" | "Potentially French" | "Not French" | "Duplicate" | "Detected"
  notes: string
  isExpanded: boolean
  checkedOnTPS: boolean
  checkedOnOTM: boolean
  checkedOnForebears: boolean
  needAddressUpdate: boolean
  needPhoneUpdate: boolean
  lastInteraction?: Date
  territoryStatus: boolean
  frenchNameMatched?: boolean
  nameFeedback?: "french" | "not-french"
}
