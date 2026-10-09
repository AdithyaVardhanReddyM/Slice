import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const POLICY: { what: string; ttl: string; why: string }[] = [
  {
    what: "GET /search",
    ttl: "30 days",
    why: "Entity IDs almost never change.",
  },
  {
    what: "GET /v2/insights",
    ttl: "7 days",
    why: "Taste tags drift slowly.",
  },
  {
    what: "Empty results",
    ttl: "1 hour",
    why: "Retried soon in case Qloo catches up.",
  },
  {
    what: "429 or 5xx",
    ttl: "Serve stale",
    why: "Shoppers never wait on an outage; refreshed in the background.",
  },
];

/** How the private Convex cache in front of Qloo behaves. */
export function CachePolicy({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Cache</CardTitle>
        <CardDescription>Private Convex cache in front of Qloo</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <dl className="divide-y">
          {POLICY.map((p) => (
            <div
              key={p.what}
              className="grid grid-cols-2 gap-x-3 gap-y-0.5 py-2.5 first:pt-0"
            >
              <dt className="font-medium">{p.what}</dt>
              <dd className="num text-right">{p.ttl}</dd>
              <dd className="col-span-2 text-muted-foreground">{p.why}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
      <CardFooter className="text-muted-foreground">
        <p>
          Keyed by method, path and sorted params. Stored in Convex and private
          to this workspace.
        </p>
      </CardFooter>
    </Card>
  );
}
