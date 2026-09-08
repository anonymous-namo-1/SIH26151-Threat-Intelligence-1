import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAskCaseAssistant } from '@workspace/api-client-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Search } from 'lucide-react';

const SUGGESTIONS = [
  'What facts are supported by the evidence in this case?',
  'What relationships are supported, and by which evidence?',
  'What important gaps or uncertainties remain?',
];

export function CaseAssistant({ caseId }: { caseId: string }) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<any>(null);
  const requestGeneration = useRef(0);
  const assistant = useAskCaseAssistant();

  useEffect(() => {
    requestGeneration.current += 1;
    setQuestion('');
    setResult(null);
    assistant.reset();
  // The mutation object is intentionally excluded: reset is only for case changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const ask = (nextQuestion = question) => {
    const trimmed = nextQuestion.trim();
    if (!trimmed || trimmed.length > 2000 || assistant.isPending) return;
    const generation = requestGeneration.current;
    setQuestion(trimmed);
    setResult(null);
    assistant.mutate(
      { caseId, data: { question: trimmed } },
      { onSuccess: (data) => {
        if (generation === requestGeneration.current) setResult(data);
      } },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          Case assistant
        </CardTitle>
        <CardDescription>
          Ask a single question about this case. Answers use only case evidence and are not saved as a conversation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <Button key={suggestion} variant="outline" size="sm" disabled={assistant.isPending}
              className="h-auto max-w-full whitespace-normal py-2 text-left justify-start"
              onClick={() => { setQuestion(suggestion); ask(suggestion); }}>
              {suggestion}
            </Button>
          ))}
        </div>
        <Textarea
          value={question}
          maxLength={2000}
          disabled={assistant.isPending}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about supported facts, relationships, or evidence gaps"
          aria-label="Question for case assistant"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{question.length}/2000</span>
          <Button onClick={() => ask()} disabled={!question.trim() || assistant.isPending}>
            {assistant.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {assistant.isPending ? 'Reviewing evidence' : 'Ask assistant'}
          </Button>
        </div>

        {assistant.error && (
          <Alert variant="destructive">
            <AlertTitle>Assistant request failed</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{assistant.error instanceof Error ? assistant.error.message : 'The request could not be completed.'}</p>
              <Button variant="outline" size="sm" onClick={() => ask()} disabled={assistant.isPending}>Retry</Button>
            </AlertDescription>
          </Alert>
        )}

        {result && (
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{result.status === 'untrusted_draft' ? 'Untrusted draft' : 'Insufficient evidence'}</Badge>
              <span className="text-xs text-muted-foreground">Verify every cited finding.</span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{result.answer}</p>
            {result.findings?.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Cited findings</h4>
                {result.findings.map((finding: any, index: number) => (
                  <div key={`${index}-${finding.text}`} className="rounded-md border p-3 text-sm">
                    <p>{finding.text}</p>
                    {finding.quotes?.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {finding.quotes.map((quote: { evidence_id: string; quote: string }, quoteIndex: number) => (
                          <blockquote
                            key={`${quote.evidence_id}-${quoteIndex}`}
                            className="border-l-2 border-primary/40 pl-3 text-xs text-muted-foreground"
                          >
                            <p className="whitespace-pre-wrap">“{quote.quote}”</p>
                            <Link
                              href={`/evidence?evidence=${encodeURIComponent(quote.evidence_id)}`}
                              className="mt-1 inline-block font-mono text-primary hover:underline"
                            >
                              Evidence {quote.evidence_id}
                            </Link>
                          </blockquote>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {finding.evidence_ids.map((id: string) => (
                        <Button key={id} asChild variant="link" size="sm" className="h-auto p-0 font-mono text-xs">
                          <Link href={`/evidence?evidence=${encodeURIComponent(id)}`}>{id}</Link>
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {result.uncertainties?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold">Uncertainties</h4>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {result.uncertainties.map((item: string) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}