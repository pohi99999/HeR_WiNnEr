# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `example`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

**If you're looking for the `React README`, you can find it at [`dataconnect-generated/react/README.md`](./react/README.md)**

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*HelpRequestsByUser*](#helprequestsbyuser)
  - [*ListSkills*](#listskills)
- [**Mutations**](#mutations)
  - [*HelpOfferInsert*](#helpofferinsert)
  - [*CreateSkill*](#createskill)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `example`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## HelpRequestsByUser
You can execute the `HelpRequestsByUser` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
helpRequestsByUser(vars: HelpRequestsByUserVariables): QueryPromise<HelpRequestsByUserData, HelpRequestsByUserVariables>;

interface HelpRequestsByUserRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: HelpRequestsByUserVariables): QueryRef<HelpRequestsByUserData, HelpRequestsByUserVariables>;
}
export const helpRequestsByUserRef: HelpRequestsByUserRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
helpRequestsByUser(dc: DataConnect, vars: HelpRequestsByUserVariables): QueryPromise<HelpRequestsByUserData, HelpRequestsByUserVariables>;

interface HelpRequestsByUserRef {
  ...
  (dc: DataConnect, vars: HelpRequestsByUserVariables): QueryRef<HelpRequestsByUserData, HelpRequestsByUserVariables>;
}
export const helpRequestsByUserRef: HelpRequestsByUserRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the helpRequestsByUserRef:
```typescript
const name = helpRequestsByUserRef.operationName;
console.log(name);
```

### Variables
The `HelpRequestsByUser` query requires an argument of type `HelpRequestsByUserVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface HelpRequestsByUserVariables {
  requesterId: UUIDString;
}
```
### Return Type
Recall that executing the `HelpRequestsByUser` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `HelpRequestsByUserData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface HelpRequestsByUserData {
  helpRequests: ({
    id: UUIDString;
    title: string;
    description: string;
    status: string;
  } & HelpRequest_Key)[];
}
```
### Using `HelpRequestsByUser`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, helpRequestsByUser, HelpRequestsByUserVariables } from '@dataconnect/generated';

// The `HelpRequestsByUser` query requires an argument of type `HelpRequestsByUserVariables`:
const helpRequestsByUserVars: HelpRequestsByUserVariables = {
  requesterId: ..., 
};

// Call the `helpRequestsByUser()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await helpRequestsByUser(helpRequestsByUserVars);
// Variables can be defined inline as well.
const { data } = await helpRequestsByUser({ requesterId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await helpRequestsByUser(dataConnect, helpRequestsByUserVars);

console.log(data.helpRequests);

// Or, you can use the `Promise` API.
helpRequestsByUser(helpRequestsByUserVars).then((response) => {
  const data = response.data;
  console.log(data.helpRequests);
});
```

### Using `HelpRequestsByUser`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, helpRequestsByUserRef, HelpRequestsByUserVariables } from '@dataconnect/generated';

// The `HelpRequestsByUser` query requires an argument of type `HelpRequestsByUserVariables`:
const helpRequestsByUserVars: HelpRequestsByUserVariables = {
  requesterId: ..., 
};

// Call the `helpRequestsByUserRef()` function to get a reference to the query.
const ref = helpRequestsByUserRef(helpRequestsByUserVars);
// Variables can be defined inline as well.
const ref = helpRequestsByUserRef({ requesterId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = helpRequestsByUserRef(dataConnect, helpRequestsByUserVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.helpRequests);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.helpRequests);
});
```

## ListSkills
You can execute the `ListSkills` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
listSkills(): QueryPromise<ListSkillsData, undefined>;

interface ListSkillsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListSkillsData, undefined>;
}
export const listSkillsRef: ListSkillsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listSkills(dc: DataConnect): QueryPromise<ListSkillsData, undefined>;

interface ListSkillsRef {
  ...
  (dc: DataConnect): QueryRef<ListSkillsData, undefined>;
}
export const listSkillsRef: ListSkillsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listSkillsRef:
```typescript
const name = listSkillsRef.operationName;
console.log(name);
```

### Variables
The `ListSkills` query has no variables.
### Return Type
Recall that executing the `ListSkills` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListSkillsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface ListSkillsData {
  skills: ({
    id: UUIDString;
    name: string;
    description?: string | null;
  } & Skill_Key)[];
}
```
### Using `ListSkills`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listSkills } from '@dataconnect/generated';


// Call the `listSkills()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listSkills();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listSkills(dataConnect);

console.log(data.skills);

// Or, you can use the `Promise` API.
listSkills().then((response) => {
  const data = response.data;
  console.log(data.skills);
});
```

### Using `ListSkills`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listSkillsRef } from '@dataconnect/generated';


// Call the `listSkillsRef()` function to get a reference to the query.
const ref = listSkillsRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listSkillsRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.skills);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.skills);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## HelpOfferInsert
You can execute the `HelpOfferInsert` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
helpOfferInsert(vars: HelpOfferInsertVariables): MutationPromise<HelpOfferInsertData, HelpOfferInsertVariables>;

interface HelpOfferInsertRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: HelpOfferInsertVariables): MutationRef<HelpOfferInsertData, HelpOfferInsertVariables>;
}
export const helpOfferInsertRef: HelpOfferInsertRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
helpOfferInsert(dc: DataConnect, vars: HelpOfferInsertVariables): MutationPromise<HelpOfferInsertData, HelpOfferInsertVariables>;

interface HelpOfferInsertRef {
  ...
  (dc: DataConnect, vars: HelpOfferInsertVariables): MutationRef<HelpOfferInsertData, HelpOfferInsertVariables>;
}
export const helpOfferInsertRef: HelpOfferInsertRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the helpOfferInsertRef:
```typescript
const name = helpOfferInsertRef.operationName;
console.log(name);
```

### Variables
The `HelpOfferInsert` mutation requires an argument of type `HelpOfferInsertVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface HelpOfferInsertVariables {
  helperId: UUIDString;
  helpRequestId: UUIDString;
  message: string;
  status: string;
}
```
### Return Type
Recall that executing the `HelpOfferInsert` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `HelpOfferInsertData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface HelpOfferInsertData {
  helpOffer_insert: HelpOffer_Key;
}
```
### Using `HelpOfferInsert`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, helpOfferInsert, HelpOfferInsertVariables } from '@dataconnect/generated';

// The `HelpOfferInsert` mutation requires an argument of type `HelpOfferInsertVariables`:
const helpOfferInsertVars: HelpOfferInsertVariables = {
  helperId: ..., 
  helpRequestId: ..., 
  message: ..., 
  status: ..., 
};

// Call the `helpOfferInsert()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await helpOfferInsert(helpOfferInsertVars);
// Variables can be defined inline as well.
const { data } = await helpOfferInsert({ helperId: ..., helpRequestId: ..., message: ..., status: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await helpOfferInsert(dataConnect, helpOfferInsertVars);

console.log(data.helpOffer_insert);

// Or, you can use the `Promise` API.
helpOfferInsert(helpOfferInsertVars).then((response) => {
  const data = response.data;
  console.log(data.helpOffer_insert);
});
```

### Using `HelpOfferInsert`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, helpOfferInsertRef, HelpOfferInsertVariables } from '@dataconnect/generated';

// The `HelpOfferInsert` mutation requires an argument of type `HelpOfferInsertVariables`:
const helpOfferInsertVars: HelpOfferInsertVariables = {
  helperId: ..., 
  helpRequestId: ..., 
  message: ..., 
  status: ..., 
};

// Call the `helpOfferInsertRef()` function to get a reference to the mutation.
const ref = helpOfferInsertRef(helpOfferInsertVars);
// Variables can be defined inline as well.
const ref = helpOfferInsertRef({ helperId: ..., helpRequestId: ..., message: ..., status: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = helpOfferInsertRef(dataConnect, helpOfferInsertVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.helpOffer_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.helpOffer_insert);
});
```

## CreateSkill
You can execute the `CreateSkill` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
createSkill(vars: CreateSkillVariables): MutationPromise<CreateSkillData, CreateSkillVariables>;

interface CreateSkillRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: CreateSkillVariables): MutationRef<CreateSkillData, CreateSkillVariables>;
}
export const createSkillRef: CreateSkillRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
createSkill(dc: DataConnect, vars: CreateSkillVariables): MutationPromise<CreateSkillData, CreateSkillVariables>;

interface CreateSkillRef {
  ...
  (dc: DataConnect, vars: CreateSkillVariables): MutationRef<CreateSkillData, CreateSkillVariables>;
}
export const createSkillRef: CreateSkillRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the createSkillRef:
```typescript
const name = createSkillRef.operationName;
console.log(name);
```

### Variables
The `CreateSkill` mutation requires an argument of type `CreateSkillVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface CreateSkillVariables {
  name: string;
}
```
### Return Type
Recall that executing the `CreateSkill` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `CreateSkillData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface CreateSkillData {
  skill_insert: Skill_Key;
}
```
### Using `CreateSkill`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, createSkill, CreateSkillVariables } from '@dataconnect/generated';

// The `CreateSkill` mutation requires an argument of type `CreateSkillVariables`:
const createSkillVars: CreateSkillVariables = {
  name: ..., 
};

// Call the `createSkill()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await createSkill(createSkillVars);
// Variables can be defined inline as well.
const { data } = await createSkill({ name: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await createSkill(dataConnect, createSkillVars);

console.log(data.skill_insert);

// Or, you can use the `Promise` API.
createSkill(createSkillVars).then((response) => {
  const data = response.data;
  console.log(data.skill_insert);
});
```

### Using `CreateSkill`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, createSkillRef, CreateSkillVariables } from '@dataconnect/generated';

// The `CreateSkill` mutation requires an argument of type `CreateSkillVariables`:
const createSkillVars: CreateSkillVariables = {
  name: ..., 
};

// Call the `createSkillRef()` function to get a reference to the mutation.
const ref = createSkillRef(createSkillVars);
// Variables can be defined inline as well.
const ref = createSkillRef({ name: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = createSkillRef(dataConnect, createSkillVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.skill_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.skill_insert);
});
```

