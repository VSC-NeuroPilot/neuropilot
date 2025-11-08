/**
 * Tool Registry for maintaining bidirectional mappings between
 * Neuro action names and MCP tool names.
 *
 * This code does the following:
 * 1. We sanitize tool names because MCP tool names may not be valid Neuro action names
 * (e.g., "GetFileContent" -> "mcp_get_file_content")
 * 2. When Neuro calls an action, we need to find the original MCP tool name
 */

/**
 * Registry that maintains bidirectional mappings between Neuro actions and MCP tools.
 *
 * @example
 * const registry = new ToolRegistry();
 * registry.register('mcp_get_file_content', 'GetFileContent');
 *
 * registry.getMCPToolName('mcp_get_file_content'); // => 'GetFileContent'
 * registry.getNeuroActionName('GetFileContent'); // => 'mcp_get_file_content'
 *
 * registry.hasNeuroAction('mcp_get_file_content'); // => true
 * registry.hasMCPTool('GetFileContent'); // => true
 */
export class ToolRegistry {
    /** Map from Neuro action name → MCP tool name */
    private neuroToMCP = new Map<string, string>();

    /** Map from MCP tool name → Neuro action name */
    private mcpToNeuro = new Map<string, string>();

    /**
     * Registers a bidirectional mapping between a Neuro action and MCP tool.
     *
     * @param neuroActionName - The sanitized Neuro action name
     * @param mcpToolName - The original MCP tool name
     *
     * @throws Error if either name is already registered with a different mapping
     */
    register(neuroActionName: string, mcpToolName: string): void {
        // Check for conflicts
        const existingMCPName = this.neuroToMCP.get(neuroActionName);
        if (existingMCPName && existingMCPName !== mcpToolName) {
            throw new Error(
                `Neuro action "${neuroActionName}" is already mapped to MCP tool "${existingMCPName}". ` +
                `Cannot remap to "${mcpToolName}".`,
            );
        }

        const existingNeuroName = this.mcpToNeuro.get(mcpToolName);
        if (existingNeuroName && existingNeuroName !== neuroActionName) {
            throw new Error(
                `MCP tool "${mcpToolName}" is already mapped to Neuro action "${existingNeuroName}". ` +
                `Cannot remap to "${neuroActionName}".`,
            );
        }

        // Register the mapping
        this.neuroToMCP.set(neuroActionName, mcpToolName);
        this.mcpToNeuro.set(mcpToolName, neuroActionName);
    }

    /**
     * Gets the MCP tool name for a given Neuro action name.
     *
     * @param neuroActionName - The Neuro action name
     * @returns The MCP tool name, or undefined if not found
     */
    getMCPToolName(neuroActionName: string): string | undefined {
        return this.neuroToMCP.get(neuroActionName);
    }

    /**
     * Gets the Neuro action name for a given MCP tool name.
     *
     * @param mcpToolName - The MCP tool name
     * @returns The Neuro action name, or undefined if not found
     */
    getNeuroActionName(mcpToolName: string): string | undefined {
        return this.mcpToNeuro.get(mcpToolName);
    }

    /**
     * Checks if a Neuro action is registered.
     *
     * @param neuroActionName - The Neuro action name
     * @returns True if registered, false otherwise
     */
    hasNeuroAction(neuroActionName: string): boolean {
        return this.neuroToMCP.has(neuroActionName);
    }

    /**
     * Checks if an MCP tool is registered.
     *
     * @param mcpToolName - The MCP tool name
     * @returns True if registered, false otherwise
     */
    hasMCPTool(mcpToolName: string): boolean {
        return this.mcpToNeuro.has(mcpToolName);
    }

    /**
     * Unregisters a mapping by Neuro action name.
     *
     * @param neuroActionName - The Neuro action name to unregister
     * @returns True if the action was registered and removed, false otherwise
     */
    unregisterByNeuroAction(neuroActionName: string): boolean {
        const mcpToolName = this.neuroToMCP.get(neuroActionName);
        if (!mcpToolName) {
            return false;
        }

        this.neuroToMCP.delete(neuroActionName);
        this.mcpToNeuro.delete(mcpToolName);
        return true;
    }

    /**
     * Unregisters a mapping by MCP tool name.
     *
     * @param mcpToolName - The MCP tool name to unregister
     * @returns True if the tool was registered and removed, false otherwise
     */
    unregisterByMCPTool(mcpToolName: string): boolean {
        const neuroActionName = this.mcpToNeuro.get(mcpToolName);
        if (!neuroActionName) {
            return false;
        }

        this.neuroToMCP.delete(neuroActionName);
        this.mcpToNeuro.delete(mcpToolName);
        return true;
    }

    /**
     * Clears all registered mappings.
     */
    clear(): void {
        this.neuroToMCP.clear();
        this.mcpToNeuro.clear();
    }

    /**
     * Gets all registered Neuro action names.
     *
     * @returns An array of all registered Neuro action names
     */
    getAllNeuroActions(): string[] {
        return Array.from(this.neuroToMCP.keys());
    }

    /**
     * Gets all registered MCP tool names.
     *
     * @returns An array of all registered MCP tool names
     */
    getAllMCPTools(): string[] {
        return Array.from(this.mcpToNeuro.keys());
    }

    /**
     * Gets the total number of registered mappings.
     *
     * @returns The count of registered mappings
     */
    get size(): number {
        return this.neuroToMCP.size;
    }

    /**
     * Creates a string representation of all mappings for debugging.
     *
     * @returns A formatted string showing all mappings
     */
    toString(): string {
        const mappings: string[] = [];
        for (const [neuroName, mcpName] of this.neuroToMCP.entries()) {
            mappings.push(`  ${neuroName} ↔ ${mcpName}`);
        }

        return mappings.length > 0
            ? `ToolRegistry (${this.size} mappings):\n${mappings.join('\n')}`
            : 'ToolRegistry (empty)';
    }
}
