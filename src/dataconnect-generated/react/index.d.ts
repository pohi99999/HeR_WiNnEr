import { HelpOfferInsertData, HelpOfferInsertVariables, HelpRequestsByUserData, HelpRequestsByUserVariables, CreateSkillData, CreateSkillVariables, ListSkillsData } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions, UseDataConnectMutationResult, useDataConnectMutationOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult, UseMutationResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useHelpOfferInsert(options?: useDataConnectMutationOptions<HelpOfferInsertData, FirebaseError, HelpOfferInsertVariables>): UseDataConnectMutationResult<HelpOfferInsertData, HelpOfferInsertVariables>;
export function useHelpOfferInsert(dc: DataConnect, options?: useDataConnectMutationOptions<HelpOfferInsertData, FirebaseError, HelpOfferInsertVariables>): UseDataConnectMutationResult<HelpOfferInsertData, HelpOfferInsertVariables>;

export function useHelpRequestsByUser(vars: HelpRequestsByUserVariables, options?: useDataConnectQueryOptions<HelpRequestsByUserData>): UseDataConnectQueryResult<HelpRequestsByUserData, HelpRequestsByUserVariables>;
export function useHelpRequestsByUser(dc: DataConnect, vars: HelpRequestsByUserVariables, options?: useDataConnectQueryOptions<HelpRequestsByUserData>): UseDataConnectQueryResult<HelpRequestsByUserData, HelpRequestsByUserVariables>;

export function useCreateSkill(options?: useDataConnectMutationOptions<CreateSkillData, FirebaseError, CreateSkillVariables>): UseDataConnectMutationResult<CreateSkillData, CreateSkillVariables>;
export function useCreateSkill(dc: DataConnect, options?: useDataConnectMutationOptions<CreateSkillData, FirebaseError, CreateSkillVariables>): UseDataConnectMutationResult<CreateSkillData, CreateSkillVariables>;

export function useListSkills(options?: useDataConnectQueryOptions<ListSkillsData>): UseDataConnectQueryResult<ListSkillsData, undefined>;
export function useListSkills(dc: DataConnect, options?: useDataConnectQueryOptions<ListSkillsData>): UseDataConnectQueryResult<ListSkillsData, undefined>;
