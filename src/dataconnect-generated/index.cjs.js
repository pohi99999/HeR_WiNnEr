const { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'example',
  service: 'her-winner',
  location: 'us-east4'
};
exports.connectorConfig = connectorConfig;

const helpOfferInsertRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'HelpOfferInsert', inputVars);
}
helpOfferInsertRef.operationName = 'HelpOfferInsert';
exports.helpOfferInsertRef = helpOfferInsertRef;

exports.helpOfferInsert = function helpOfferInsert(dcOrVars, vars) {
  return executeMutation(helpOfferInsertRef(dcOrVars, vars));
};

const helpRequestsByUserRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'HelpRequestsByUser', inputVars);
}
helpRequestsByUserRef.operationName = 'HelpRequestsByUser';
exports.helpRequestsByUserRef = helpRequestsByUserRef;

exports.helpRequestsByUser = function helpRequestsByUser(dcOrVars, vars) {
  return executeQuery(helpRequestsByUserRef(dcOrVars, vars));
};

const createSkillRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'CreateSkill', inputVars);
}
createSkillRef.operationName = 'CreateSkill';
exports.createSkillRef = createSkillRef;

exports.createSkill = function createSkill(dcOrVars, vars) {
  return executeMutation(createSkillRef(dcOrVars, vars));
};

const listSkillsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListSkills');
}
listSkillsRef.operationName = 'ListSkills';
exports.listSkillsRef = listSkillsRef;

exports.listSkills = function listSkills(dc) {
  return executeQuery(listSkillsRef(dc));
};
