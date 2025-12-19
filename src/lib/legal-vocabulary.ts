/**
 * Legal Vocabulary for Transcription Accuracy
 * 
 * This vocabulary is used for word boosting in the Case.dev Voice API
 * to improve transcription accuracy for legal terminology.
 * 
 * Word boosting helps the transcription model recognize domain-specific
 * terms that might otherwise be misheard or transcribed incorrectly.
 */

/**
 * Core legal vocabulary for word boosting
 * Limited to most essential terms to avoid API limits
 */
export const LEGAL_WORD_BOOST = [
  // Court proceedings (most common)
  'objection', 'sustained', 'overruled', 'sidebar', 'recess',
  'stipulate', 'motion', 'ruling', 'judgment',
  
  // Parties and roles (essential)
  'plaintiff', 'defendant', 'petitioner', 'respondent',
  'counsel', 'attorney', 'witness', 'deponent',
  
  // Evidence and procedure (key terms)
  'exhibit', 'evidence', 'testimony', 'deposition', 'affidavit',
  'subpoena', 'discovery', 'hearsay', 'privilege',
  
  // Common legal phrases
  'pursuant to', 'duly sworn', 'under oath',
] as const;

/**
 * Transcription configuration for optimal legal accuracy
 * Based on Case.dev Voice API parameters
 * Note: Only include parameters confirmed to work with the API
 */
export const LEGAL_TRANSCRIPTION_CONFIG = {
  speaker_labels: true,      // Enable speaker diarization for identifying speakers
  auto_chapters: true,       // Detect topic changes for better organization
  word_boost: [...LEGAL_WORD_BOOST] as string[],
};

/**
 * Accuracy thresholds for legal transcription quality assessment
 */
export const ACCURACY_THRESHOLDS = {
  EXCELLENT: 0.95,  // Court-reporter grade
  GOOD: 0.90,       // Suitable for most legal purposes
  FAIR: 0.80,       // Review recommended
  POOR: 0,          // Significant review required
} as const;

export type AccuracyRating = 'excellent' | 'good' | 'fair' | 'poor';

/**
 * Get accuracy rating based on confidence score
 */
export function getAccuracyRating(confidence: number): AccuracyRating {
  if (confidence >= ACCURACY_THRESHOLDS.EXCELLENT) return 'excellent';
  if (confidence >= ACCURACY_THRESHOLDS.GOOD) return 'good';
  if (confidence >= ACCURACY_THRESHOLDS.FAIR) return 'fair';
  return 'poor';
}

/**
 * Get detailed accuracy assessment
 */
export function getAccuracyAssessment(confidence: number): {
  rating: AccuracyRating;
  description: string;
  recommendation: string;
} {
  const rating = getAccuracyRating(confidence);
  
  const assessments = {
    excellent: {
      rating: 'excellent' as const,
      description: 'Court-reporter grade accuracy',
      recommendation: 'Transcript is suitable for official court records with minimal review.',
    },
    good: {
      rating: 'good' as const,
      description: 'High accuracy suitable for most legal purposes',
      recommendation: 'Recommend quick review of proper nouns and technical terms.',
    },
    fair: {
      rating: 'fair' as const,
      description: 'Moderate accuracy - review recommended',
      recommendation: 'Manual review recommended before use in legal proceedings. Check for audio quality issues.',
    },
    poor: {
      rating: 'poor' as const,
      description: 'Low accuracy - significant review required',
      recommendation: 'Audio quality may be poor. Consider re-recording or professional transcription service.',
    },
  };
  
  return assessments[rating];
}
