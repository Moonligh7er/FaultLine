import type {
  CouncilBriefingInput,
  PacketInput,
  PacketOutput,
  PressSummaryInput,
} from './types';

// ============================================================
// Packet Generator
//
// Pure function: takes a packet input, returns markdown body + JSON payload
// + optional public URL. Downstream services (email delivery, PDF conversion
// via Puppeteer, static-site publication) consume the output.
//
// Format guardrails matching /briefing-packets:
//   - No editorial embellishment. Only structured data + methodology links.
//   - Non-partisan for council briefings.
//   - Right-of-reply status rendered explicitly for press summaries.
//   - Methodology link mandatory in every packet footer.
// ============================================================

export function generatePacket(input: PacketInput): PacketOutput {
  const generatedAt = new Date().toISOString();
  if (input.packetType === 'council-district-briefing') {
    return generateCouncilBriefing(input, generatedAt);
  }
  return generatePressSummary(input, generatedAt);
}

// ── Council-district briefing ─────────────────────────────────────────────

function generateCouncilBriefing(
  input: CouncilBriefingInput,
  generatedAt: string,
): PacketOutput {
  const m = input.metrics;
  const monthChange = m.totalOpenReports - m.totalOpenReportsPriorMonth;
  const changeLabel =
    monthChange > 0 ? `up ${monthChange}` : monthChange < 0 ? `down ${Math.abs(monthChange)}` : `unchanged`;
  const districtVsCity =
    m.medianResponseDays < m.citywideMedianResponseDays
      ? 'outperforming'
      : m.medianResponseDays > m.citywideMedianResponseDays
        ? 'underperforming'
        : 'matching';

  const sections: string[] = [];

  sections.push(
    `# Fault Line District Infrastructure Briefing`,
    ``,
    `**${m.districtLabel} · ${input.metrics.jurisdictionName} · ${input.reportingMonth}**`,
    ``,
    `## Summary metrics`,
    ``,
    `- **Total open reports in district:** ${m.totalOpenReports} (${changeLabel} from prior month)`,
    `- **Median response time:** ${m.medianResponseDays} days (vs. citywide ${m.citywideMedianResponseDays} days — district is *${districtVsCity}*)`,
    `- **Reports past statutory deadline:** ${m.reportsPastStatutoryDeadline}`,
    `- **Community-verified clusters:** ${m.newVerifiedClusters} new this month, ${m.resolvedClustersThisMonth} resolved`,
    ``,
  );

  if (m.topOpenItems.length > 0) {
    sections.push(`## Top items likely to reach constituent-services`, ``);
    for (const item of m.topOpenItems) {
      sections.push(
        `- **${item.location}** — ${item.category} · ${item.reportCount} reports · ${item.daysOpen} days open${item.context ? `. ${item.context}` : ''}`,
      );
    }
    sections.push(``);
  }

  if (m.fastestResolutions.length > 0) {
    sections.push(`## Fastest resolutions this month (credit where it's due)`, ``);
    for (const r of m.fastestResolutions) {
      sections.push(
        `- **${r.location}** — ${r.category} · resolved in ${r.daysToResolution} days${r.creditedCrew ? ` by ${r.creditedCrew}` : ''}.`,
      );
    }
    sections.push(``);
  }

  if (m.equityFlags.length > 0) {
    sections.push(`## Access & equity flags`, ``);
    for (const f of m.equityFlags) {
      sections.push(
        `- Census tract ${f.censusTractGeoid} shows disproportionate report density (${f.peerPercentile}th percentile of peer-tract group). Categories: ${f.categories.join(', ')}. ${f.note}`,
      );
    }
    sections.push(``);
  }

  sections.push(
    `## Methodology`,
    ``,
    `Data source: Fault Line community reports and escalation log.`,
    `Response time: median days from verified escalation to independently confirmed fix.`,
    `Peer comparison: districts within the same city, weighted for report volume.`,
    `Equity aggregation: census-tract public attributes only; never reporter-inferred.`,
    ``,
    `Full methodology: ${input.methodologyUrl}`,
    ``,
    `---`,
    `Generated ${generatedAt}. Non-partisan by design — this packet is provided to every council member of record for this district regardless of party.`,
  );

  return {
    packetType: 'council-district-briefing',
    jsonPayload: {
      packetType: input.packetType,
      reportingMonth: input.reportingMonth,
      metrics: m,
      methodologyUrl: input.methodologyUrl,
      generatedAt,
    },
    markdownBody: sections.join('\n'),
    generatedAt,
  };
}

// ── Press-ready cluster summary ───────────────────────────────────────────

function generatePressSummary(
  input: PressSummaryInput,
  generatedAt: string,
): PacketOutput {
  const sections: string[] = [];

  sections.push(
    `# ${input.triggerDescription}`,
    ``,
    `**Reporting jurisdiction:** ${input.jurisdictionName}`,
    `**Prepared:** ${generatedAt.slice(0, 10)}`,
    ``,
    `## Suggested headline`,
    ``,
    `> ${input.jurisdictionName} misses statutory deadline on ${input.location} cluster; ${input.distinctReporters} residents document the condition.`,
    ``,
    `## Draft lede`,
    ``,
    `${input.reportCount} independent Fault Line reports since ${input.firstReportedAt.slice(0, 10)} have documented a persistent condition at ${input.location} in ${input.jurisdictionName}. ${input.vehicleDamageReportsAttached > 0 ? `${input.vehicleDamageReportsAttached} of the reports include timestamped vehicle-damage documentation. ` : ''}The statutory response window under ${input.statuteCitation} elapsed on day ${input.reportCount - input.daysPastStatutoryDeadline}; the reports remain open ${input.daysPastStatutoryDeadline} days past deadline.`,
    ``,
    `## Key numbers`,
    ``,
    `| Field | Value |`,
    `|---|---|`,
    `| Independent reports | ${input.reportCount} |`,
    `| Distinct reporters | ${input.distinctReporters} |`,
    `| Days since first report | ${input.daysSinceFirstReport} |`,
    `| Days past statutory deadline | ${input.daysPastStatutoryDeadline} |`,
    `| Vehicle damage reports attached | ${input.vehicleDamageReportsAttached} |`,
    `| Responsible authority | ${input.responsibleAuthority} |`,
    `| First notified | ${input.authorityFirstNotifiedAt.slice(0, 10)} |`,
    `| Re-notifications | ${input.reNotifications.map((d) => d.slice(0, 10)).join(', ') || 'none'} |`,
    ``,
  );

  if (input.photoEvidence.length > 0) {
    sections.push(`## GPS-tagged evidence`, ``);
    for (const photo of input.photoEvidence) {
      sections.push(
        `- Photograph (${photo.capturedAt.slice(0, 10)})${photo.caption ? ` — ${photo.caption}` : ''}${photo.url ? ` — ${photo.url}` : ''}`,
      );
    }
    sections.push(``);
  }

  sections.push(
    `## Right of reply`,
    ``,
    input.responseContent
      ? `The responsible authority responded to Fault Line's pre-notification. Response appended below:\n\n> ${input.responseContent.replace(/\n/g, '\n> ')}`
      : `The responsible authority received notification and was re-notified but no public response has been recorded. This summary was shared with the authority contact ${input.rightOfReplyStatus.toLowerCase()}.`,
    ``,
    `## Methodology & citation`,
    ``,
    `- Community-verification threshold: 3 independent reports required.`,
    `- Statutory reference: [${input.statuteCitation}](${input.statuteCitationUrl})`,
    `- Statute dataset version: ${input.statuteDatasetVersion} · verification status: ${input.statuteVerificationStatus}`,
    `- Right-of-reply status at publication: ${input.rightOfReplyStatus}`,
    `- Full methodology: ${input.methodologyUrl}`,
    `- Underlying cluster: ${input.reportUrl}`,
    ``,
    `**Not legal advice.** Statute references cite Fault Line's versioned dataset; reporters should verify against current law before publishing statutory claims.`,
    ``,
    `---`,
    `Generated ${generatedAt}.`,
  );

  return {
    packetType: 'press-cluster-summary',
    jsonPayload: {
      packetType: input.packetType,
      triggerDescription: input.triggerDescription,
      jurisdictionName: input.jurisdictionName,
      clusterId: input.clusterId,
      location: input.location,
      reportCount: input.reportCount,
      distinctReporters: input.distinctReporters,
      daysSinceFirstReport: input.daysSinceFirstReport,
      daysPastStatutoryDeadline: input.daysPastStatutoryDeadline,
      statuteCitation: input.statuteCitation,
      statuteDatasetVersion: input.statuteDatasetVersion,
      statuteVerificationStatus: input.statuteVerificationStatus,
      rightOfReplyStatus: input.rightOfReplyStatus,
      responseContent: input.responseContent,
      responsibleAuthority: input.responsibleAuthority,
      reportUrl: input.reportUrl,
      methodologyUrl: input.methodologyUrl,
      generatedAt,
    },
    markdownBody: sections.join('\n'),
    generatedAt,
  };
}
