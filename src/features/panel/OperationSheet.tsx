import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { request, ApiError } from "@/lib/api/client";
import { planSchema, taskSchema } from "@/lib/api/schemas";
import { formatTime } from "@/lib/format";
import { queryClient } from "./queries";
import { QueryState } from "./Shared";
import { useDisplayTimezone } from "./display";
import type { OperationSheetProps } from "@/types/panel-ui.type";
/** OperationSheet 将预检、影响确认和任务受理分成可观察的步骤。 */
export function OperationSheet({ operation, onClose }: OperationSheetProps) {
  const timeZone = useDisplayTimezone();
  const [confirmationInput, setConfirmation] = useState({
    planId: "",
    text: "",
  });
  const [acceptedPlan, setAccepted] = useState<string | null>(null);
  const key = useRef("");
  const [, setParams] = useSearchParams();
  const preview = useMutation({
    mutationFn: () =>
      request("/operations/preview", planSchema, {
        method: "POST",
        body: JSON.stringify(operation),
      }),
  });
  const submit = useMutation({
    mutationFn: () =>
      request("/operations", taskSchema, {
        method: "POST",
        headers: { "Idempotency-Key": key.current },
        body: JSON.stringify({
          planId: preview.data?.id,
          confirmationText:
            confirmationInput.planId === preview.data?.id
              ? confirmationInput.text || null
              : null,
        }),
      }),
    onSuccess: (task) => {
      queryClient.setQueryData(["task", task.id], task);
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setParams((previous) => {
        previous.set("task", task.id);
        return previous;
      });
      onClose();
    },
  });
  const { mutate: getPreview, reset: resetPreview } = preview;
  const { reset: resetSubmit } = submit;
  useEffect(() => {
    if (!operation) return;
    key.current = crypto.randomUUID();
    resetPreview();
    resetSubmit();
    getPreview();
  }, [operation, getPreview, resetPreview, resetSubmit]);
  const plan = preview.data;
  const confirmation =
    confirmationInput.planId === plan?.id ? confirmationInput.text : "";
  const accepted = !!plan && acceptedPlan === plan.id;
  const needsPreview =
    submit.error instanceof ApiError &&
    ["PLAN_EXPIRED", "REVISION_CONFLICT"].includes(submit.error.code);
  /** 重新预检意味着新的确认流程，不能沿用旧的文本和幂等键。 */
  function recheck() {
    key.current = crypto.randomUUID();
    setConfirmation({ planId: "", text: "" });
    setAccepted(null);
    resetSubmit();
    getPreview();
  }
  return (
    <Sheet
      open={operation !== null}
      onOpenChange={(open) => {
        if (!open && !submit.isPending) onClose();
      }}
    >
      <SheetContent className="w-full sm:max-w-[560px]">
        <SheetHeader>
          <SheetTitle>核对操作计划</SheetTitle>
          <SheetDescription>
            确认前由服务器检查权限、平台、路径与引用。受理后任务在服务器继续执行。
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4">
          <QueryState
            pending={preview.isPending}
            error={preview.error}
            retry={recheck}
          >
            {plan && (
              <>
                <Alert>
                  <AlertTitle>{plan.summary}</AlertTitle>
                  <AlertDescription>
                    预检有效至 {formatTime(plan.expiresAt, timeZone)}
                  </AlertDescription>
                </Alert>
                <dl className="detail-grid text-sm">
                  {plan.details.map((detail) => (
                    <div className="contents" key={detail.label}>
                      <dt className="text-muted-foreground">{detail.label}</dt>
                      <dd className="break-all">{detail.value}</dd>
                    </div>
                  ))}
                </dl>
                {plan.warnings.map((warning) => (
                  <Alert key={warning.code}>
                    <AlertTitle>{warning.message}</AlertTitle>
                  </Alert>
                ))}
                {plan.blockedReasons.map((reason, index) => (
                  <Alert key={`${reason.code}:${index}`} variant="destructive">
                    <AlertTitle>无法执行</AlertTitle>
                    <AlertDescription>{reason.message}</AlertDescription>
                  </Alert>
                ))}
                {plan.canExecute && (
                  <FieldGroup>
                    {plan.confirmationText && (
                      <Field>
                        <FieldLabel htmlFor="operation-confirm">
                          输入 {plan.confirmationText} 确认
                        </FieldLabel>
                        <Input
                          id="operation-confirm"
                          value={confirmation}
                          onChange={(event) =>
                            setConfirmation({
                              planId: plan.id,
                              text: event.target.value,
                            })
                          }
                          autoComplete="off"
                        />
                      </Field>
                    )}
                    <Field orientation="horizontal">
                      <Checkbox
                        id="operation-impact"
                        checked={accepted}
                        onCheckedChange={(checked) =>
                          setAccepted(checked ? plan.id : null)
                        }
                      />
                      <FieldLabel htmlFor="operation-impact">
                        我已核对目标与影响范围
                      </FieldLabel>
                    </Field>
                  </FieldGroup>
                )}
              </>
            )}
          </QueryState>
          {submit.error && (
            <Alert variant="destructive">
              <AlertTitle>{submit.error.message}</AlertTitle>
              <AlertDescription>
                {needsPreview
                  ? "资源或计划已经变化，请重新预检。"
                  : "网络结果不确定时重试会沿用原幂等键，不会重复创建任务。"}
              </AlertDescription>
            </Alert>
          )}
        </div>
        <SheetFooter>
          <Button
            disabled={
              !plan?.canExecute ||
              !accepted ||
              (!!plan.confirmationText &&
                confirmation !== plan.confirmationText) ||
              submit.isPending ||
              needsPreview
            }
            onClick={() => submit.mutate()}
          >
            {submit.isPending && <Spinner data-icon="inline-start" />}
            {submit.isPending ? "正在提交" : "确认并创建任务"}
          </Button>
          {needsPreview && (
            <Button variant="outline" onClick={recheck}>
              重新预检
            </Button>
          )}
          <Button
            variant="outline"
            disabled={submit.isPending}
            onClick={onClose}
          >
            取消
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
