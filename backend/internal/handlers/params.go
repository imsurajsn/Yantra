package handlers

import (
	"strconv"

	"github.com/gin-gonic/gin"
)

// parseUintParam parses a Gin route param (e.g. ":id") as a uint. Shared
// across every resource handler (users, groups, pages, ...) that takes a
// numeric ID in the path.
func parseUintParam(c *gin.Context, name string) (uint, error) {
	v, err := strconv.ParseUint(c.Param(name), 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(v), nil
}
