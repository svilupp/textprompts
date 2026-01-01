// Example: Basic usage of textprompts-go
package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/svilupp/textprompts/packages/textprompts-go"
)

func main() {
	// Create a temporary prompt file for this example
	tmpDir, err := os.MkdirTemp("", "textprompts-example-*")
	if err != nil {
		log.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	// Create a sample prompt file with metadata
	promptContent := `---
title = "Customer Greeting"
version = "1.0.0"
description = "A friendly greeting for customer support"
---
Hello {customer_name}!

Welcome to {company_name}. We're here to help you with {issue_type}.

Best regards,
{agent_name}
`
	promptPath := filepath.Join(tmpDir, "greeting.txt")
	if err := os.WriteFile(promptPath, []byte(promptContent), 0644); err != nil {
		log.Fatal(err)
	}

	// Load the prompt
	prompt, err := textprompts.LoadPrompt(promptPath)
	if err != nil {
		log.Fatal(err)
	}

	// Print metadata
	fmt.Println("=== Prompt Metadata ===")
	fmt.Printf("Title: %s\n", prompt.Meta.GetTitle())
	fmt.Printf("Version: %s\n", prompt.Meta.GetVersion())
	fmt.Printf("Description: %s\n", prompt.Meta.GetDescription())
	fmt.Println()

	// Print placeholders
	fmt.Println("=== Placeholders ===")
	for _, ph := range prompt.Prompt.Placeholders() {
		fmt.Printf("- {%s}\n", ph)
	}
	fmt.Println()

	// Format the prompt with values
	result, err := prompt.Format(map[string]interface{}{
		"customer_name": "Alice",
		"company_name":  "ACME Corp",
		"issue_type":    "billing question",
		"agent_name":    "Sarah",
	})
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("=== Formatted Prompt ===")
	fmt.Println(result)
}
