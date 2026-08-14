export const backlogItemTypes=["EPIC","FEATURE","STORY","TASK","BUG"]as const;export type BacklogItemType=typeof backlogItemTypes[number];
export const backlogOrigins=["LOCAL","AZURE_DEVOPS"]as const;export type BacklogOrigin=typeof backlogOrigins[number];
export const localBacklogStatuses=["DRAFT","READY","IN_PROGRESS","DONE","REMOVED"]as const;export type LocalBacklogStatus=typeof localBacklogStatuses[number];
export const deliveryStates=["PROPOSED","READY","IN_PROGRESS","VALIDATION","DONE","REMOVED","UNMAPPED"]as const;export type DeliveryState=typeof deliveryStates[number];
export const sprintStatuses=["PLANNED","ACTIVE","COMPLETED"]as const;export type SprintStatus=typeof sprintStatuses[number];
export const criterionStatuses=["DRAFT","READY","MET","NOT_MET"]as const;export const dependencyTypes=["BLOCKS","REQUIRES","RELATES_TO"]as const;
export type WorkItemSource={origin:BacklogOrigin;externalId:string|null;externalRevision:string|null;sourceUrl:string|null;sourceUpdatedAt:string|null;syncedAt:string|null};
export type CalculationEvidence={value:number|null;numerator:number|null;denominator:number|null;method:string;source:BacklogOrigin;sourceRevision:string;calculatedAt:string};
export type StoryNarrative={actor:string;capability:string;businessValue:string};export type AcceptanceCriterion={given:string;when:string;then:string;status:typeof criterionStatuses[number]};
export const allowedParent:Record<BacklogItemType,BacklogItemType|null>={EPIC:null,FEATURE:"EPIC",STORY:"FEATURE",TASK:"STORY",BUG:"STORY"};
export function canParent(parent:BacklogItemType|null,child:BacklogItemType){return allowedParent[child]===parent}
export function storyText(story:StoryNarrative){return`As a ${story.actor.trim()}, I want ${story.capability.trim()}, so that ${story.businessValue.trim()}.`}
export function validateAcceptanceCriteria(input:AcceptanceCriterion[]){const errors:Record<string,string>={};if(!input.length)errors.criteria="At least one acceptance criterion is required before a Story is ready.";input.forEach((x,i)=>{if(!x.given.trim())errors[`criteria.${i}.given`]="Given is required.";if(!x.when.trim())errors[`criteria.${i}.when`]="When is required.";if(!x.then.trim())errors[`criteria.${i}.then`]="Then is required."});return{ok:Object.keys(errors).length===0,errors}}
export function assertOriginWriteAllowed(origin:BacklogOrigin){if(origin!=="LOCAL")throw new Error("AZURE_ORIGIN_READ_ONLY")}
export function percentageEvidence(numerator:number,denominator:number,source:BacklogOrigin,sourceRevision:string,calculatedAt:string):CalculationEvidence{return{value:denominator>0?Math.round(numerator/denominator*100):null,numerator,denominator,method:"completed committed points / committed points",source,sourceRevision,calculatedAt}}
export const stage2ContractVersion="2.0"as const;
