/**
 * Client half of the prompt optimizer bundle.
 *
 * One seat: the sparkle button in the composer tool row, immediately before the
 * model selector — and therefore before the WorkBuddy credit readout, which
 * registers at order 4. This one registers at order 3 so it stays leftmost of
 * the pair.
 *
 * The button reads the live draft from `useInput` and writes the rewrite back
 * through `inputActions.setDraft`, so the result lands in the real composer
 * (with its attachments, references and quotes intact) instead of a dialog.
 */

window.__ModuleLoader__.load({
	id: "@local/dsh-prompt-optimizer",
	factory(require) {
		const React = require("react");

		/** Loopback route the Host half registers; see index.js. */
		const ROUTE = "/plugins/dsh-prompt-optimizer/rewrite";

		const ZH = {
			"button.aria": "优化提示词",
			"button.hint": "优化提示词",
			"button.busy": "正在优化提示词",
			"button.failed": "优化失败：{message}",
		};

		const EN = {
			"button.aria": "Optimize prompt",
			"button.hint": "Optimize prompt",
			"button.busy": "Optimizing prompt",
			"button.failed": "Optimization failed: {message}",
		};

		/**
		 * Only the geometry observed from the shipped composer controls is
		 * copied here — the 28px round hit area and the `opacity` dimming of a
		 * disabled control. The shipped class names are deliberately NOT reused:
		 * they belong to the Host's own module stylesheet.
		 */
		const CSS = `
.dsh-po-btn {
	box-sizing: border-box;
	corner-shape: round;
	background: transparent;
	width: 28px;
	height: 28px;
	color: var(--dsw-alias-label-secondary);
	cursor: pointer;
	border: none;
	border-radius: 999px;
	flex: none;
	place-items: center;
	display: grid;
	padding: 0;
	transition: background-color .1s, color .1s, opacity .1s;
}
.dsh-po-btn:hover:not(:disabled) {
	background: var(--dsw-alias-interactive-bg-hover-solid);
	color: var(--dsw-alias-label-primary);
}
.dsh-po-btn:focus-visible {
	outline: 2px solid var(--dsw-alias-brand-primary);
	outline-offset: 1px;
}
.dsh-po-btn:disabled {
	opacity: .4;
	cursor: default;
}
.dsh-po-btn[data-busy="true"] {
	cursor: progress;
}
/* While busy the button is disabled only to reject a second click; the ring
   must stay at full contrast, so the disabled dimming is lifted here. */
.dsh-po-btn[data-busy="true"]:disabled {
	opacity: 1;
}
.dsh-po-spinner {
	display: block;
	transform-origin: 50% 50%;
	animation: dsh-po-spin .7s linear infinite;
}
.dsh-po-btn[data-failed="true"],
.dsh-po-btn[data-failed="true"]:hover:not(:disabled) {
	color: var(--dsw-alias-state-error-primary);
}
@keyframes dsh-po-spin {
	to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
	.dsh-po-spinner { animation: none; }
}
`;

		/**
		 * Fallback translator.
		 *
		 * The slot framework injects a `t` for entries that declare `locale`, and
		 * that injected seat is preferred. This one exists so a framework change
		 * in that wiring degrades to readable English instead of throwing from
		 * render and taking the composer row down with it.
		 */
		let translate = (key) => EN[key] ?? key;

		/** Fill `{name}` placeholders in a translated string. */
		function format(text, values) {
			return String(text).replace(/\{(\w+)\}/g, (match, key) => (Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match));
		}

		/**
		 * Attach the stylesheet for the lifetime of this Client run.
		 *
		 * `document.createElement` rather than the `styles` builtin: that builtin
		 * belongs to the dynamic Client sandbox, and this module is a static
		 * bundle whose factory only receives `require`.
		 */
		function insertCss() {
			const tag = document.createElement("style");
			tag.dataset.dshPromptOptimizer = "";
			tag.textContent = CSS;
			document.head.appendChild(tag);
			return () => {
				tag.remove();
			};
		}

		/**
		 * The WorkBuddy sparkle, drawn rather than copied: a stroked four-point
		 * star with a small filled companion at the upper right. `currentColor`
		 * lets the hover and error states tint it without a second asset.
		 */
		function Sparkle() {
			return React.createElement(
				"svg",
				{
					className: "dsh-po-glyph",
					width: 17,
					height: 17,
					viewBox: "0 0 20 20",
					fill: "none",
					"aria-hidden": "true",
					focusable: "false",
				},
				React.createElement("path", {
					d: "M8 4.7c.55 3.05 1.95 4.45 5 5-3.05.55-4.45 1.95-5 5-.55-3.05-1.95-4.45-5-5 3.05-.55 4.45-1.95 5-5Z",
					stroke: "currentColor",
					strokeWidth: 1.4,
					strokeLinejoin: "round",
					strokeLinecap: "round",
				}),
				React.createElement("path", {
					d: "M15.5 2.2c.24 1.4.6 1.76 2 2-1.4.24-1.76.6-2 2-.24-1.4-.6-1.76-2-2 1.4-.24 1.76-.6 2-2Z",
					fill: "currentColor",
				}),
			);
		}

		/**
		 * Busy state: the sparkle is swapped for a spinning ring in the same
		 * 28px cell, so the row does not shift when the request starts. A faint
		 * full track plus a bright arc reads as motion at this size, which a
		 * plain dashed circle does not.
		 */
		function Spinner() {
			return React.createElement(
				"svg",
				{
					className: "dsh-po-spinner",
					width: 17,
					height: 17,
					viewBox: "0 0 20 20",
					fill: "none",
					"aria-hidden": "true",
					focusable: "false",
				},
				React.createElement("circle", {
					cx: 10,
					cy: 10,
					r: 6.4,
					stroke: "currentColor",
					strokeWidth: 1.8,
					opacity: 0.25,
				}),
				React.createElement("path", {
					d: "M10 3.6a6.4 6.4 0 0 1 6.4 6.4",
					stroke: "currentColor",
					strokeWidth: 1.8,
					strokeLinecap: "round",
				}),
			);
		}

		/**
		 * The composer seat.
		 *
		 * The draft is read through a selector that returns a primitive, so the
		 * entry re-renders only when the text actually changes; the host gates
		 * non-empty submission on the same `trim()` comparison.
		 */
		function OptimizeButton(props) {
			const t = typeof props.t === "function" ? props.t : translate;
			const useInput = props.useInput;
			const inputActions = props.inputActions;
			const draft = useInput((state) => (state !== undefined && state !== null && typeof state.draft === "string" ? state.draft : ""));
			const busyState = React.useState(false);
			const busy = busyState[0];
			const setBusy = busyState[1];
			const errorState = React.useState(null);
			const error = errorState[0];
			const setError = errorState[1];

			const canRun = !busy && typeof inputActions?.setDraft === "function" && draft.trim() !== "";

			const run = React.useCallback(async () => {
				if (!canRun) return;
				const text = draft.trim();
				setBusy(true);
				setError(null);
				try {
					const response = await fetch(ROUTE, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ text }),
						credentials: "same-origin",
					});
					let payload;
					try {
						payload = await response.json();
					} catch {
						payload = undefined;
					}
					const rewritten = payload === undefined ? undefined : payload.text;
					if (!response.ok || typeof rewritten !== "string" || rewritten.trim() === "") {
						const reason = payload !== undefined && typeof payload.error === "string" && payload.error !== "" ? payload.error : `HTTP ${response.status}`;
						throw new Error(reason);
					}
					inputActions.setDraft(rewritten);
				} catch (failure) {
					setError(failure !== null && typeof failure === "object" && typeof failure.message === "string" ? failure.message : String(failure));
				} finally {
					setBusy(false);
				}
			}, [busy, canRun, draft, inputActions, setBusy, setError]);

			const label = busy ? t("button.busy") : t("button.aria");
			const title = error !== null ? format(t("button.failed"), { message: error }) : t("button.hint");

			return React.createElement(
				"button",
				{
					type: "button",
					className: "dsh-po-btn",
					disabled: !canRun,
					"aria-label": label,
					"aria-busy": busy ? "true" : undefined,
					title: title,
					"data-busy": busy ? "true" : undefined,
					"data-failed": error !== null ? "true" : undefined,
					onClick: run,
				},
				React.createElement(busy ? Spinner : Sparkle),
			);
		}

		const namespace = "promptOptimizer";

		return {
			inject: ["slots", "locale"],
			apply(ctx) {
				ctx.effect(() => ctx.locale.register(namespace, "zh", ZH), "dsh-prompt-optimizer: zh copy");
				ctx.effect(() => ctx.locale.register(namespace, "en", EN), "dsh-prompt-optimizer: en copy");
				ctx.effect(insertCss, "dsh-prompt-optimizer: button styles");
				const bound = ctx.locale.bind(namespace);
				translate = (key) => {
					const text = bound(key);
					return typeof text === "string" ? text : (EN[key] ?? key);
				};
				ctx.slots.inject("conversation.input.right", () =>
					ctx.slots.register(
						{
							name: "conversation.input.right",
							id: "dsh-prompt-optimizer-button",
							order: 3,
							locale: namespace,
							inject: () => ({ t: translate }),
						},
						OptimizeButton,
					),
				);
			},
		};
	},
});
