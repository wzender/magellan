"""
Shared colour, font, and style constants for the Dash app.
"""

COLORS = {
    "bg_page":        "#f8f9fc",
    "bg_card":        "#ffffff",
    "bg_header":      "#1e1e2e",
    "border":         "#e5e7eb",
    "text_primary":   "#111827",
    "text_secondary": "#6b7280",
    "text_muted":     "#9ca3af",
    "accent_blue":    "#3b82f6",
    "green_strong":   "#16a34a",
    "amber":          "#d97706",
    "red":            "#dc2626",
    # Matrix diagonal (correct predictions)
    "matrix_diag_hi": "rgba(22, 163, 74, 0.85)",
    "matrix_diag_lo": "rgba(187, 247, 208, 0.6)",
    # Matrix off-diagonal (errors)
    "matrix_err_hi":  "rgba(220, 38, 38, 0.85)",
    "matrix_err_lo":  "rgba(254, 226, 226, 0.5)",
    # Transition matrix
    "trans_a_only":   "#3b82f6",   # Run A correct, B wrong
    "trans_b_only":   "#16a34a",   # Run B correct, A wrong
    "trans_both_bad": "#dc2626",   # Both wrong
    "trans_neutral":  "#f3f4f6",   # Both correct / no change
}

FONTS = {
    "body": "Segoe UI, system-ui, -apple-system, sans-serif",
    "mono": "Consolas, 'Courier New', monospace",
    "size": {
        "xs":  "11px",
        "sm":  "12px",
        "base":"13px",
        "md":  "14px",
        "lg":  "16px",
        "xl":  "18px",
        "2xl": "22px",
    },
}

CARD_STYLE = {
    "background":    "#ffffff",
    "borderRadius":  "10px",
    "border":        "1px solid #e5e7eb",
    "boxShadow":     "0 1px 6px rgba(0,0,0,0.06)",
    "padding":       "20px",
    "marginBottom":  "16px",
}

SECTION_HEADER_STYLE = {
    "fontSize":      "13px",
    "fontWeight":    "700",
    "letterSpacing": "0.08em",
    "textTransform": "uppercase",
    "color":         "#6b7280",
    "marginBottom":  "12px",
    "fontFamily":    FONTS["body"],
}
