"use client";

import { useState } from "react";
import { ReleasePortfolio } from "./release-portfolio";
import { ReleaseDetail } from "./release-detail";

export function ReleaseCenter({ currentUserId, permissions }: {
  currentUserId: string;
  permissions: {
    canCreateRelease: boolean; canEditRelease: boolean; canScope: boolean; canReadiness: boolean; canRecordDeployment: boolean;
    canRequestSignoff: boolean; canDecideSignoff: boolean; canManageSignoff: boolean; canWaiveCondition: boolean;
    canCreateCampaign: boolean; canCreateTestCase: boolean; canEditTestCase: boolean; canExecute: boolean; canManageTraceability: boolean;
    canCreateDefect: boolean; canEditDefect: boolean; canCloseDefect: boolean;
  };
}) {
  const [openReleaseId, setOpenReleaseId] = useState<string | null>(null);

  return <>
    <ReleasePortfolio canCreate={permissions.canCreateRelease} onOpen={setOpenReleaseId} />
    {openReleaseId && <ReleaseDetail
      releaseId={openReleaseId}
      onClose={() => setOpenReleaseId(null)}
      currentUserId={currentUserId}
      permissions={{
        canEdit: permissions.canEditRelease, canScope: permissions.canScope, canReadiness: permissions.canReadiness, canRecordDeployment: permissions.canRecordDeployment,
        canRequestSignoff: permissions.canRequestSignoff, canDecideSignoff: permissions.canDecideSignoff, canManageSignoff: permissions.canManageSignoff, canWaiveCondition: permissions.canWaiveCondition,
        canCreateCampaign: permissions.canCreateCampaign, canCreateTestCase: permissions.canCreateTestCase, canEditTestCase: permissions.canEditTestCase, canExecute: permissions.canExecute, canManageTraceability: permissions.canManageTraceability,
        canCreateDefect: permissions.canCreateDefect, canEditDefect: permissions.canEditDefect, canCloseDefect: permissions.canCloseDefect,
      }}
    />}
  </>;
}
