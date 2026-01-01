package textprompts

import (
	"reflect"
	"testing"
)

func TestNewPromptString(t *testing.T) {
	tests := []struct {
		name                 string
		content              string
		expectedPlaceholders []string
	}{
		{
			name:                 "simple",
			content:              "Hello {name}!",
			expectedPlaceholders: []string{"name"},
		},
		{
			name:                 "multiple",
			content:              "Hello {first} {last}!",
			expectedPlaceholders: []string{"first", "last"},
		},
		{
			name:                 "no placeholders",
			content:              "Hello world!",
			expectedPlaceholders: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ps := NewPromptString(tt.content)
			if ps.String() != tt.content {
				t.Errorf("PromptString.String() = %q, want %q", ps.String(), tt.content)
			}
			if ps.Content() != tt.content {
				t.Errorf("PromptString.Content() = %q, want %q", ps.Content(), tt.content)
			}
			if !reflect.DeepEqual(ps.Placeholders(), tt.expectedPlaceholders) {
				t.Errorf("PromptString.Placeholders() = %v, want %v", ps.Placeholders(), tt.expectedPlaceholders)
			}
		})
	}
}

func TestPromptStringFormat(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		values   map[string]interface{}
		opts     []FormatOption
		expected string
		wantErr  bool
	}{
		{
			name:     "simple replacement",
			content:  "Hello {name}!",
			values:   map[string]interface{}{"name": "Alice"},
			expected: "Hello Alice!",
		},
		{
			name:     "multiple replacements",
			content:  "Hello {first} {last}!",
			values:   map[string]interface{}{"first": "Alice", "last": "Smith"},
			expected: "Hello Alice Smith!",
		},
		{
			name:     "repeated placeholder",
			content:  "{name} says hi to {name}!",
			values:   map[string]interface{}{"name": "Alice"},
			expected: "Alice says hi to Alice!",
		},
		{
			name:     "integer value",
			content:  "Count: {count}",
			values:   map[string]interface{}{"count": 42},
			expected: "Count: 42",
		},
		{
			name:     "float value",
			content:  "Price: {price}",
			values:   map[string]interface{}{"price": 19.99},
			expected: "Price: 19.99",
		},
		{
			name:     "escaped braces preserved",
			content:  "Use {{literal}} and {var}",
			values:   map[string]interface{}{"var": "value"},
			expected: "Use {literal} and value",
		},
		{
			name:    "missing placeholder error",
			content: "Hello {name} and {other}!",
			values:  map[string]interface{}{"name": "Alice"},
			wantErr: true,
		},
		{
			name:     "missing placeholder with skip validation",
			content:  "Hello {name} and {other}!",
			values:   map[string]interface{}{"name": "Alice"},
			opts:     []FormatOption{WithSkipValidation()},
			expected: "Hello Alice and {other}!",
		},
		{
			name:     "empty values with skip validation",
			content:  "Hello {name}!",
			values:   map[string]interface{}{},
			opts:     []FormatOption{WithSkipValidation()},
			expected: "Hello {name}!",
		},
		{
			name:     "no placeholders",
			content:  "Hello world!",
			values:   map[string]interface{}{},
			expected: "Hello world!",
		},
		{
			name:     "placeholder with format spec",
			content:  "Price: {price:.2f}",
			values:   map[string]interface{}{"price": "19.99"},
			expected: "Price: 19.99",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ps := NewPromptString(tt.content)
			got, err := ps.Format(tt.values, tt.opts...)
			if (err != nil) != tt.wantErr {
				t.Errorf("PromptString.Format() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && got != tt.expected {
				t.Errorf("PromptString.Format() = %q, want %q", got, tt.expected)
			}
		})
	}
}

func TestPromptStringMustFormat(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		ps := NewPromptString("Hello {name}!")
		got := ps.MustFormat(map[string]interface{}{"name": "Alice"})
		if got != "Hello Alice!" {
			t.Errorf("MustFormat() = %q, want %q", got, "Hello Alice!")
		}
	})

	t.Run("panic on error", func(t *testing.T) {
		defer func() {
			if r := recover(); r == nil {
				t.Errorf("MustFormat() did not panic on missing placeholder")
			}
		}()
		ps := NewPromptString("Hello {name}!")
		ps.MustFormat(map[string]interface{}{})
	})
}

func TestPromptStringPlaceholdersCopy(t *testing.T) {
	ps := NewPromptString("Hello {name}!")
	placeholders := ps.Placeholders()

	// Modify the returned slice
	if len(placeholders) > 0 {
		placeholders[0] = "modified"
	}

	// Original should be unchanged
	originalPlaceholders := ps.Placeholders()
	if len(originalPlaceholders) > 0 && originalPlaceholders[0] == "modified" {
		t.Error("Placeholders() should return a copy, not the original slice")
	}
}

type customStringer struct {
	value string
}

func (c customStringer) String() string {
	return c.value
}

func TestPromptStringFormatStringer(t *testing.T) {
	ps := NewPromptString("Hello {name}!")
	got, err := ps.Format(map[string]interface{}{
		"name": customStringer{value: "Alice"},
	})
	if err != nil {
		t.Fatalf("Format() error = %v", err)
	}
	if got != "Hello Alice!" {
		t.Errorf("Format() = %q, want %q", got, "Hello Alice!")
	}
}
