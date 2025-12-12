import { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } from 'firebase/data-connect';

export const connectorConfig = {
  connector: 'example',
  service: 'her-winner',
  location: 'us-east4'
};

export const helpOfferInsertRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'HelpOfferInsert', inputVars);
}
helpOfferInsertRef.operationName = 'HelpOfferInsert';

export function helpOfferInsert(dcOrVars, vars) {
  return executeMutation(helpOfferInsertRef(dcOrVars, vars));
}

export const helpRequestsByUserRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'HelpRequestsByUser', inputVars);
}
helpRequestsByUserRef.operationName = 'HelpRequestsByUser';

export function helpRequestsByUser(dcOrVars, vars) {
  return executeQuery(helpRequestsByUserRef(dcOrVars, vars));
}

export const createSkillRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateSkill', inputVars);
}
createSkillRef.operationName = 'CreateSkill';

export function createSkill(dcOrVars, vars) {
  return executeMutation(createSkillRef(dcOrVars, vars));
}

export const listSkillsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListSkills');
}
listSkillsRef.operationName = 'ListSkills';

export function listSkills(dc) {
  return executeQuery(listSkillsRef(dc));
}

