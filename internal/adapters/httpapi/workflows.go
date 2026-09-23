package httpapi

import (
	"context"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"larda/internal/application"
	"larda/internal/domain"
)

func (h handler) workflowRoutes(v1 *gin.RouterGroup) {
	v1.GET("/teams", func(c *gin.Context) {
		value, err := h.service.Teams(c.Request.Context())
		respond(c, http.StatusOK, value, err)
	})
	v1.GET("/teams/:teamID", func(c *gin.Context) {
		id, ok := paramID(c, "teamID")
		if !ok {
			return
		}
		value, err := h.service.Team(c.Request.Context(), id)
		respond(c, http.StatusOK, value, err)
	})
	v1.POST("/teams", requireActor, func(c *gin.Context) {
		var input application.TeamInput
		if !decode(c, &input) {
			return
		}
		value, err := h.service.CreateTeam(c.Request.Context(), actorID(c), input)
		respond(c, http.StatusCreated, value, err)
	})
	v1.PUT("/teams/:teamID", requireActor, func(c *gin.Context) {
		id, ok := paramID(c, "teamID")
		if !ok {
			return
		}
		var input application.TeamInput
		if !decode(c, &input) {
			return
		}
		value, err := h.service.UpdateTeam(c.Request.Context(), actorID(c), id, input)
		respond(c, http.StatusOK, value, err)
	})
	v1.POST("/teams/:teamID/members", requireActor, h.teamMemberAction(h.service.AddMember))
	v1.POST("/teams/:teamID/captain", requireActor, h.teamMemberAction(h.service.TransferCaptain))
	v1.DELETE("/teams/:teamID/members/:userID", requireActor, func(c *gin.Context) {
		id, ok := paramID(c, "teamID")
		if !ok {
			return
		}
		userID, ok := paramID(c, "userID")
		if !ok {
			return
		}
		value, err := h.service.RemoveMember(c.Request.Context(), actorID(c), id, userID)
		respond(c, http.StatusOK, value, err)
	})
	v1.GET("/teams/:teamID/proposals", requireActor, func(c *gin.Context) {
		id, ok := paramID(c, "teamID")
		if !ok {
			return
		}
		value, err := h.service.TeamProposals(c.Request.Context(), actorID(c), id)
		respond(c, http.StatusOK, value, err)
	})
	v1.GET("/tasks/:taskID/proposals", requireActor, func(c *gin.Context) {
		id, ok := paramID(c, "taskID")
		if !ok {
			return
		}
		value, err := h.service.Proposals(c.Request.Context(), actorID(c), id)
		respond(c, http.StatusOK, value, err)
	})
	v1.POST("/tasks/:taskID/proposals", requireActor, func(c *gin.Context) {
		id, ok := paramID(c, "taskID")
		if !ok {
			return
		}
		var input application.ProposalInput
		if !decode(c, &input) {
			return
		}
		value, err := h.service.SubmitProposal(c.Request.Context(), actorID(c), id, input)
		respond(c, http.StatusCreated, value, err)
	})
	v1.POST("/proposals/:proposalID/decision", requireActor, func(c *gin.Context) {
		id, ok := paramID(c, "proposalID")
		if !ok {
			return
		}
		var input struct {
			Status string `json:"status"`
		}
		if !decode(c, &input) {
			return
		}
		value, err := h.service.DecideProposal(c.Request.Context(), actorID(c), id, input.Status)
		respond(c, http.StatusOK, value, err)
	})
	v1.POST("/proposals/:proposalID/complete", requireActor, h.proposalAction(h.service.CompleteProposal))
	v1.POST("/proposals/:proposalID/cancel", requireActor, h.proposalAction(h.service.CancelProposal))
	v1.POST("/proposals/:proposalID/milestones", requireActor, func(c *gin.Context) {
		id, ok := paramID(c, "proposalID")
		if !ok {
			return
		}
		var input application.MilestoneInput
		if !decode(c, &input) {
			return
		}
		value, err := h.service.AddMilestone(c.Request.Context(), actorID(c), id, input)
		respond(c, http.StatusCreated, value, err)
	})
	v1.POST("/milestones/:milestoneID/approve", requireActor, func(c *gin.Context) {
		id, ok := paramID(c, "milestoneID")
		if !ok {
			return
		}
		value, err := h.service.ApproveMilestone(c.Request.Context(), actorID(c), id)
		respond(c, http.StatusOK, value, err)
	})
	v1.POST("/milestones/:milestoneID/submit", requireActor, func(c *gin.Context) {
		id, ok := paramID(c, "milestoneID")
		if !ok {
			return
		}
		var input struct {
			ResultURL string `json:"result_url"`
		}
		if !decode(c, &input) {
			return
		}
		value, err := h.service.SubmitMilestone(c.Request.Context(), actorID(c), id, input.ResultURL)
		respond(c, http.StatusOK, value, err)
	})
	v1.POST("/milestones/:milestoneID/review", requireActor, func(c *gin.Context) {
		id, ok := paramID(c, "milestoneID")
		if !ok {
			return
		}
		var input struct {
			Accepted *bool `json:"accepted"`
		}
		if !decode(c, &input) {
			return
		}
		if input.Accepted == nil {
			respondError(c, fmt.Errorf("%w: accepted is required", domain.ErrInvalid))
			return
		}
		value, err := h.service.ReviewMilestone(c.Request.Context(), actorID(c), id, *input.Accepted)
		respond(c, http.StatusOK, value, err)
	})
	v1.POST("/tasks/:taskID/complete", requireActor, h.taskAction(h.service.CompleteTask))
	v1.POST("/tasks/:taskID/cancel", requireActor, h.taskAction(h.service.CancelTask))
}

func (h handler) teamMemberAction(action func(context.Context, int64, int64, int64) (*domain.Team, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := paramID(c, "teamID")
		if !ok {
			return
		}
		var input struct {
			UserID int64 `json:"user_id"`
		}
		if !decode(c, &input) {
			return
		}
		if input.UserID <= 0 {
			respondError(c, fmt.Errorf("%w: user_id must be positive", domain.ErrInvalid))
			return
		}
		value, err := action(c.Request.Context(), actorID(c), id, input.UserID)
		respond(c, http.StatusOK, value, err)
	}
}

func (h handler) proposalAction(action func(context.Context, int64, int64) (*domain.Proposal, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := paramID(c, "proposalID")
		if !ok {
			return
		}
		value, err := action(c.Request.Context(), actorID(c), id)
		respond(c, http.StatusOK, value, err)
	}
}

func (h handler) taskAction(action func(context.Context, int64, int64) (*domain.Task, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, ok := paramID(c, "taskID")
		if !ok {
			return
		}
		value, err := action(c.Request.Context(), actorID(c), id)
		respond(c, http.StatusOK, value, err)
	}
}
