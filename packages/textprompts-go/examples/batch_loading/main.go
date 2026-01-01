// Example: Loading multiple prompts from directories
package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/svilupp/textprompts/packages/textprompts-go"
)

func main() {
	// Create temporary directory structure for this example
	tmpDir, err := os.MkdirTemp("", "textprompts-example-*")
	if err != nil {
		log.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	// Create directory structure
	promptsDir := filepath.Join(tmpDir, "prompts")
	nestedDir := filepath.Join(promptsDir, "support")
	os.MkdirAll(nestedDir, 0755)

	// Create sample prompts
	prompts := map[string]string{
		filepath.Join(promptsDir, "greeting.txt"): `---
title = "Greeting"
version = "1.0.0"
description = "A greeting prompt"
---
Hello {name}!`,
		filepath.Join(promptsDir, "farewell.txt"): `---
title = "Farewell"
version = "1.0.0"
description = "A farewell prompt"
---
Goodbye {name}!`,
		filepath.Join(nestedDir, "help.txt"): `---
title = "Help Request"
version = "1.0.0"
description = "Support help prompt"
---
How can I help you, {customer}?`,
		filepath.Join(nestedDir, "ticket.txt"): `---
title = "Ticket Response"
version = "1.0.0"
description = "Support ticket response"
---
Your ticket #{ticket_id} has been {status}.`,
	}

	for path, content := range prompts {
		if err := os.WriteFile(path, []byte(content), 0644); err != nil {
			log.Fatal(err)
		}
	}

	fmt.Println("=== Load All Prompts (Non-Recursive) ===")
	fmt.Println()

	loadedPrompts, err := textprompts.LoadPrompts([]string{promptsDir})
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Found %d prompts:\n", len(loadedPrompts))
	for _, p := range loadedPrompts {
		fmt.Printf("  - %s (%s)\n", p.Meta.GetTitle(), filepath.Base(p.Path))
	}
	fmt.Println()

	fmt.Println("=== Load All Prompts (Recursive) ===")
	fmt.Println()

	loadedPrompts, err = textprompts.LoadPrompts(
		[]string{promptsDir},
		textprompts.WithRecursive(),
	)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Found %d prompts:\n", len(loadedPrompts))
	for _, p := range loadedPrompts {
		relPath, _ := filepath.Rel(promptsDir, p.Path)
		fmt.Printf("  - %s (%s)\n", p.Meta.GetTitle(), relPath)
	}
	fmt.Println()

	fmt.Println("=== Load with Max Files Limit ===")
	fmt.Println()

	loadedPrompts, err = textprompts.LoadPrompts(
		[]string{promptsDir},
		textprompts.WithRecursive(),
		textprompts.WithMaxFiles(2),
	)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Found %d prompts (limited to 2):\n", len(loadedPrompts))
	for _, p := range loadedPrompts {
		fmt.Printf("  - %s\n", p.Meta.GetTitle())
	}
	fmt.Println()

	fmt.Println("=== Load Specific Files ===")
	fmt.Println()

	loadedPrompts, err = textprompts.LoadPrompts([]string{
		filepath.Join(promptsDir, "greeting.txt"),
		filepath.Join(nestedDir, "help.txt"),
	})
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Loaded %d specific prompts:\n", len(loadedPrompts))
	for _, p := range loadedPrompts {
		fmt.Printf("  - %s: %s\n", p.Meta.GetTitle(), p.Meta.GetDescription())
	}
	fmt.Println()

	fmt.Println("=== Create Prompt Lookup ===")
	fmt.Println()

	// Load all and create a lookup by title
	loadedPrompts, _ = textprompts.LoadPrompts(
		[]string{promptsDir},
		textprompts.WithRecursive(),
	)

	promptLookup := make(map[string]*textprompts.Prompt)
	for _, p := range loadedPrompts {
		promptLookup[p.Meta.GetTitle()] = p
	}

	// Use the lookup
	if greeting, ok := promptLookup["Greeting"]; ok {
		result, _ := greeting.Format(map[string]interface{}{"name": "Alice"})
		fmt.Printf("Greeting result: %s\n", result)
	}

	if ticket, ok := promptLookup["Ticket Response"]; ok {
		result, _ := ticket.Format(map[string]interface{}{
			"ticket_id": "12345",
			"status":    "resolved",
		})
		fmt.Printf("Ticket result: %s\n", result)
	}
}
