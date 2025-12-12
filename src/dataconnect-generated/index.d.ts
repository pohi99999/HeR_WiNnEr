import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, MutationRef, MutationPromise } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface CreateSkillData {
  skill_insert: Skill_Key;
}

export interface CreateSkillVariables {
  name: string;
}

export interface HelpOfferInsertData {
  helpOffer_insert: HelpOffer_Key;
}

export interface HelpOfferInsertVariables {
  helperId: UUIDString;
  helpRequestId: UUIDString;
  message: string;
  status: string;
}

export interface HelpOffer_Key {
  helperId: UUIDString;
  helpRequestId: UUIDString;
  __typename?: 'HelpOffer_Key';
}

export interface HelpRequest_Key {
  id: UUIDString;
  __typename?: 'HelpRequest_Key';
}

export interface HelpRequestsByUserData {
  helpRequests: ({
    id: UUIDString;
    title: string;
    description: string;
    status: string;
  } & HelpRequest_Key)[];
}

export interface HelpRequestsByUserVariables {
  requesterId: UUIDString;
}

export interface ListSkillsData {
  skills: ({
    id: UUIDString;
    name: string;
    description?: string | null;
  } & Skill_Key)[];
}

export interface Message_Key {
  id: UUIDString;
  __typename?: 'Message_Key';
}

export interface Skill_Key {
  id: UUIDString;
  __typename?: 'Skill_Key';
}

export interface UserSkill_Key {
  userId: UUIDString;
  skillId: UUIDString;
  __typename?: 'UserSkill_Key';
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

interface HelpOfferInsertRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: HelpOfferInsertVariables): MutationRef<HelpOfferInsertData, HelpOfferInsertVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: HelpOfferInsertVariables): MutationRef<HelpOfferInsertData, HelpOfferInsertVariables>;
  operationName: string;
}
export const helpOfferInsertRef: HelpOfferInsertRef;

export function helpOfferInsert(vars: HelpOfferInsertVariables): MutationPromise<HelpOfferInsertData, HelpOfferInsertVariables>;
export function helpOfferInsert(dc: DataConnect, vars: HelpOfferInsertVariables): MutationPromise<HelpOfferInsertData, HelpOfferInsertVariables>;

interface HelpRequestsByUserRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: HelpRequestsByUserVariables): QueryRef<HelpRequestsByUserData, HelpRequestsByUserVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: HelpRequestsByUserVariables): QueryRef<HelpRequestsByUserData, HelpRequestsByUserVariables>;
  operationName: string;
}
export const helpRequestsByUserRef: HelpRequestsByUserRef;

export function helpRequestsByUser(vars: HelpRequestsByUserVariables): QueryPromise<HelpRequestsByUserData, HelpRequestsByUserVariables>;
export function helpRequestsByUser(dc: DataConnect, vars: HelpRequestsByUserVariables): QueryPromise<HelpRequestsByUserData, HelpRequestsByUserVariables>;

interface CreateSkillRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateSkillVariables): MutationRef<CreateSkillData, CreateSkillVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: CreateSkillVariables): MutationRef<CreateSkillData, CreateSkillVariables>;
  operationName: string;
}
export const createSkillRef: CreateSkillRef;

export function createSkill(vars: CreateSkillVariables): MutationPromise<CreateSkillData, CreateSkillVariables>;
export function createSkill(dc: DataConnect, vars: CreateSkillVariables): MutationPromise<CreateSkillData, CreateSkillVariables>;

interface ListSkillsRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListSkillsData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListSkillsData, undefined>;
  operationName: string;
}
export const listSkillsRef: ListSkillsRef;

export function listSkills(): QueryPromise<ListSkillsData, undefined>;
export function listSkills(dc: DataConnect): QueryPromise<ListSkillsData, undefined>;

