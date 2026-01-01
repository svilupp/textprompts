package textprompts

import (
	"errors"
	"reflect"
	"testing"
)

func TestExtractPlaceholders(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected []string
	}{
		{
			name:     "simple placeholder",
			input:    "Hello {name}!",
			expected: []string{"name"},
		},
		{
			name:     "multiple placeholders",
			input:    "Hello {first_name} {last_name}!",
			expected: []string{"first_name", "last_name"},
		},
		{
			name:     "duplicate placeholders",
			input:    "Hello {name}, {name}!",
			expected: []string{"name"},
		},
		{
			name:     "no placeholders",
			input:    "Hello world!",
			expected: nil,
		},
		{
			name:     "escaped braces",
			input:    "Use {{literal}} braces and {placeholder}",
			expected: []string{"placeholder"},
		},
		{
			name:     "placeholder with format spec",
			input:    "Price: {price:.2f}",
			expected: []string{"price"},
		},
		{
			name:     "multiple format specs",
			input:    "{name} owes {amount:.2f} on {date:%Y-%m-%d}",
			expected: []string{"amount", "date", "name"},
		},
		{
			name:     "empty braces",
			input:    "Empty {} placeholder",
			expected: nil,
		},
		{
			name:     "nested escaped braces",
			input:    "JSON: {{{key}}}",
			expected: []string{"key"},
		},
		{
			name:     "placeholder with spaces",
			input:    "Hello { name }!",
			expected: []string{"name"},
		},
		{
			name:     "underscore in name",
			input:    "Hello {user_name}!",
			expected: []string{"user_name"},
		},
		{
			name:     "complex template",
			input:    "Dear {customer_name},\n\nYour order {order_id} is {status}.\n\nTotal: {total:.2f}\n\nThanks,\n{company_name}",
			expected: []string{"company_name", "customer_name", "order_id", "status", "total"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ExtractPlaceholders(tt.input)
			if !reflect.DeepEqual(got, tt.expected) {
				t.Errorf("ExtractPlaceholders(%q) = %v, want %v", tt.input, got, tt.expected)
			}
		})
	}
}

func TestValidateFormatArgs(t *testing.T) {
	tests := []struct { //nolint:govet // table field order is for readability
		name         string
		placeholders []string
		values       map[string]interface{}
		wantErr      bool
		wantMissing  []string
	}{
		{
			name:         "all provided",
			placeholders: []string{"name", "status"},
			values:       map[string]interface{}{"name": "Alice", "status": "active"},
			wantErr:      false,
		},
		{
			name:         "missing one",
			placeholders: []string{"name", "status"},
			values:       map[string]interface{}{"name": "Alice"},
			wantErr:      true,
			wantMissing:  []string{"status"},
		},
		{
			name:         "missing multiple",
			placeholders: []string{"name", "status", "role"},
			values:       map[string]interface{}{"name": "Alice"},
			wantErr:      true,
			wantMissing:  []string{"role", "status"},
		},
		{
			name:         "extra values ok",
			placeholders: []string{"name"},
			values:       map[string]interface{}{"name": "Alice", "extra": "value"},
			wantErr:      false,
		},
		{
			name:         "empty placeholders",
			placeholders: []string{},
			values:       map[string]interface{}{"name": "Alice"},
			wantErr:      false,
		},
		{
			name:         "empty values",
			placeholders: []string{"name"},
			values:       map[string]interface{}{},
			wantErr:      true,
			wantMissing:  []string{"name"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateFormatArgs(tt.placeholders, tt.values)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateFormatArgs() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if tt.wantErr && err != nil {
				var formatErr *FormatError
				if !errors.As(err, &formatErr) {
					t.Errorf("ValidateFormatArgs() error type = %T, want *FormatError", err)
					return
				}
				if !reflect.DeepEqual(formatErr.Missing, tt.wantMissing) {
					t.Errorf("FormatError.Missing = %v, want %v", formatErr.Missing, tt.wantMissing)
				}
			}
		})
	}
}
