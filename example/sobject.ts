
/**
 * DO NOT MODIFY THIS FILE!
 *
 * This file is generated by the salesforce-to-types plugin and
 * may be regenerated in the future. It is recommended to make
 * changes to that plugin then regenerate these files.
 *
 */

import { ID, Attribute } from './sobjectFieldTypes';

export type SObjectAttribute<TString> = SObject & Attribute<TString>;
export interface SObject {
  Id: ID;
}
