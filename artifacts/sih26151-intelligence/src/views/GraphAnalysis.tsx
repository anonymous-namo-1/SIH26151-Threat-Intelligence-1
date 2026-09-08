import { CaseScope } from "@/hooks/use-case-workspace";
import { GraphBoard } from "@/features/graph/GraphBoard";

export function GraphAnalysis() {
  return (
    <div className="flex-1 h-full w-full flex flex-col -m-4 sm:-m-8">
      {/* 
        The Shell might have padding, so we use negative margins to make the graph full bleed.
        But since we are inside a CaseScope, wait, CaseScope renders the active case selector.
      */}
      <div className="p-4 sm:p-8 pb-0">
        <CaseScope>
          <div className="h-[calc(100vh-12rem)] min-h-[600px] border rounded-lg overflow-hidden bg-background">
            <GraphBoard />
          </div>
        </CaseScope>
      </div>
    </div>
  );
}
