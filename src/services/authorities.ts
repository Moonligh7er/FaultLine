import { supabase } from './supabase';
import { Authority, AuthoritySubmissionMethod } from '../types';

export async function findAuthorityByLocation(
  latitude: number,
  longitude: number,
  state?: string,
  city?: string
): Promise<Authority | null> {
  // First try PostGIS boundary lookup
  const { data: gisResult } = await supabase.rpc('find_authority_by_point', {
    lat: latitude,
    lng: longitude,
  });

  if (gisResult && gisResult.length > 0) {
    return mapDbToAuthority(gisResult[0]);
  }

  // Fallback: lookup by city/state
  if (city && state) {
    const { data } = await supabase
      .from('authorities')
      .select('*')
      .eq('state', state)
      .eq('city', city)
      .eq('is_active', true)
      .order('level', { ascending: true })
      .limit(1);

    if (data && data.length > 0) {
      return mapDbToAuthority(data[0]);
    }
  }

  // Fallback: state-level authority
  if (state) {
    const { data } = await supabase
      .from('authorities')
      .select('*')
      .eq('state', state)
      .eq('level', 'state')
      .eq('is_active', true)
      .limit(1);

    if (data && data.length > 0) {
      return mapDbToAuthority(data[0]);
    }
  }

  return null;
}

export async function getAuthorityById(id: string): Promise<Authority | null> {
  const { data, error } = await supabase
    .from('authorities')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return mapDbToAuthority(data);
}

export async function getAuthoritiesByState(state: string): Promise<Authority[]> {
  const { data, error } = await supabase
    .from('authorities')
    .select('*')
    .eq('state', state)
    .eq('is_active', true)
    .order('name');

  if (error) return [];
  return (data || []).map(mapDbToAuthority);
}

function mapDbToAuthority(row: any): Authority {
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    state: row.state,
    city: row.city,
    county: row.county,
    submissionMethods: row.submission_methods || [],
    boundaryGeoJson: row.boundary_geojson,
    responseTimeAvgDays: row.response_time_avg_days,
    fixRatePercent: row.fix_rate_percent,
    isActive: row.is_active,
  };
}
